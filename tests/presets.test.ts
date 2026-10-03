import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { presetJson, readPreset, readPresetFile } from "@/app/presets/file";
import { createPresetSession } from "@/app/presets/session";
import {
  applySettings,
  type Category,
  copySettings,
} from "@/app/presets/settings";
import type { PresetStore } from "@/app/presets/store";
import { createDocument, createResources, findLayer } from "@/core/document";
import { createImageSource, type WhiteBalance } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { applyCrop } from "@/features/crop/edits";
import { setDetails } from "@/features/details/edits";
import { defaultGrain } from "@/features/grain/model";
import { addHealPatch } from "@/features/heal/edits";
import { addLayer, setLayer } from "@/features/layers/edits";
import { setToneCurve } from "@/features/tone-curves/edits";
import { setVignette } from "@/features/vignette/edits";
import { setWhiteBalance } from "@/features/white-balance/edits";

const size = [64, 32] as const;

async function openPhoto(asShot?: WhiteBalance) {
  const gpu = await init();
  const raw = asShot && {
    asShot,
    createPass(): never {
      throw Error("Not rendered.");
    },
    dispose() {},
  };
  const image = createImageSource(
    target(gpu, { size, format: "rgba16float" }),
    raw,
  );
  const resources = createResources();
  const source = resources.add(new File([], "photo"), image);
  return createDocument(
    {
      frame: imageFrame(size),
      layers: [createImageLayer(source, "Photo", asShot)],
    },
    resources,
  );
}

const everythingButWhiteBalance = new Set<Category>([
  "light",
  "color",
  "toneCurve",
  "colorMixer",
  "details",
  "vignette",
  "grain",
]);

test("pasted settings replace the chosen categories as one edit after an open gesture, leaving local work alone", async () => {
  const a = await openPhoto();
  setAdjustments(a, { exposure: 1, contrast: 20, vibrance: 30 });
  setAdjustments(a, { incrementalTemperature: 15 });
  setToneCurve(a, [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.6 },
    { x: 1, y: 1 },
  ]);
  setVignette(
    a,
    { intensity: 40, softness: 70 },
    addLayer(a, createLayer("vignette")),
  );
  setDetails(a, { clarity: 30 }, addLayer(a, createLayer("details")));
  const copied = copySettings(a, everythingButWhiteBalance);

  const b = await openPhoto();
  setAdjustments(b, { exposure: -1, shadows: 50, saturation: -20 });
  setAdjustments(b, { incrementalTint: 10 });
  const vignette = addLayer(b, createLayer("vignette"));
  setLayer(b, vignette, { visible: false, opacity: 0.5 });
  addLayer(b, createMask({ kind: "linear", start: [0, 0], end: [64, 0] }), {
    inside: vignette,
  });
  const grain = addLayer(b, createLayer("grain"));
  const mask = addLayer(
    b,
    createMask({ kind: "linear", start: [0, 0], end: [64, 32] }),
  );
  setAdjustments(b, { exposure: 2 }, mask);
  const nested = addLayer(b, createLayer("details"), { inside: mask });
  const heal = addLayer(b, createLayer("heal"));
  addHealPatch(
    b,
    heal,
    { mode: "paint", size: 6, feather: 0, flow: 1, points: [[20, 10, 1]] },
    [8, 0],
  );
  applyCrop(b, { ...imageFrame(size), angle: 5 });
  const before = b.scene.getState();
  const steps = () => b.history.status.getState().undoCount;
  const undoCount = steps();

  // A slider still held keeps its own step.
  b.history.begin();
  setAdjustments(b, { whites: 10 });
  const gesture = b.scene.getState();
  applySettings(b, copied);
  const pasted = b.scene.getState();
  expect(steps()).toBe(undoCount + 2);
  expect(b.history.status.getState().editing).toBe(false);

  const [image, ...layers] = pasted.layers;
  expect(image.adjustments).toEqual({
    ...a.scene.getState().layers[0].adjustments,
    incrementalTemperature: 0,
    incrementalTint: 10,
  });
  expect(image.toneCurve).toEqual(a.scene.getState().layers[0].toneCurve);
  // Effects change their values in place; the stack, masks, healing, and frame stay as they were.
  const [, ...kept] = before.layers;
  expect(layers.slice(0, -1).map(({ id }) => id)).toEqual(
    kept.map(({ id }) => id),
  );
  expect(findLayer(pasted.layers, vignette)).toMatchObject({
    visible: false,
    opacity: 0.5,
    children: findLayer(before.layers, vignette)?.children,
    vignette: { intensity: 40, softness: 70 },
  });
  expect(findLayer(pasted.layers, grain)).toMatchObject({
    grain: defaultGrain,
  });
  expect(findLayer(pasted.layers, mask)).toBe(findLayer(before.layers, mask));
  expect(findLayer(pasted.layers, nested)).toBe(
    findLayer(before.layers, nested),
  );
  expect(findLayer(pasted.layers, heal)).toBe(findLayer(before.layers, heal));
  expect(pasted.frame).toBe(before.frame);
  // A missing Details layer comes on top; the missing Color Mixer, at its defaults, adds none.
  expect(layers.at(-1)).toMatchObject({
    kind: "details",
    details: { clarity: 30, sharpening: 0, sharpenRadius: 1 },
  });
  expect(layers.some((layer) => layer.kind === "color-mixer")).toBe(false);

  // Pasting again changes nothing, so it adds no step.
  applySettings(b, copied);
  expect(steps()).toBe(undoCount + 2);
  b.history.undo();
  expect(b.scene.getState()).toBe(gesture);
  b.history.undo();
  expect(b.scene.getState()).toBe(before);
  b.history.redo();
  b.history.redo();
  expect(b.scene.getState()).toEqual(pasted);
});

test("settings the photo can't take, such as the other kind of white balance, change nothing, even a held gesture", async () => {
  const jpeg = await openPhoto();
  setAdjustments(jpeg, { incrementalTemperature: 20, incrementalTint: -5 });
  const raw = await openPhoto({ temperature: 5000, tint: 10 });
  setWhiteBalance(raw, { temperature: 6500, tint: 5 });
  const other = await openPhoto({ temperature: 4000, tint: 0 });
  const balance = new Set<Category>(["whiteBalance"]);
  const kelvin = copySettings(raw, balance);
  const incremental = copySettings(jpeg, balance);
  expect(kelvin).toEqual({ whiteBalance: { temperature: 6500, tint: 5 } });
  expect(incremental).toEqual({
    whiteBalance: { incrementalTemperature: 20, incrementalTint: -5 },
  });

  jpeg.history.begin();
  setAdjustments(jpeg, { exposure: 1 });
  const held = jpeg.scene.getState();
  expect(() => applySettings(jpeg, kelvin)).toThrow("only a RAW photo has");
  // Valid light doesn't apply before out-of-range effects are rejected.
  expect(() =>
    applySettings(jpeg, {
      light: {
        exposure: -1,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
      },
      details: { clarity: 0, sharpening: 200, sharpenRadius: 1 },
      grain: { amount: 101, size: 25, roughness: 50 },
    }),
  ).toThrow("Invalid settings details.sharpening");
  expect(jpeg.scene.getState()).toBe(held);
  expect(jpeg.history.status.getState()).toEqual({
    undoCount: 1,
    redoCount: 0,
    editing: true,
  });
  jpeg.history.commit();

  const opened = other.scene.getState();
  expect(() => applySettings(other, incremental)).toThrow(
    "which a RAW photo sets in kelvin",
  );
  expect(() =>
    applySettings(other, { whiteBalance: { temperature: 1500, tint: 0 } }),
  ).toThrow("Invalid RAW white balance temperature");
  expect(other.scene.getState()).toBe(opened);
  applySettings(other, kelvin);
  expect(other.scene.getState().layers[0].whiteBalance).toEqual({
    temperature: 6500,
    tint: 5,
  });
  expect(other.history.status.getState().undoCount).toBe(1);
});

test("presets validate fully, and failing storage or files keep the presets there are", async () => {
  const warm = {
    name: "Warm",
    settings: { color: { vibrance: 20, saturation: 5 } },
  };
  const json = structuredClone(presetJson(warm));
  expect(readPreset(json)).toEqual(warm);
  const malformed = [
    [{ ...json, version: 2 }, "needs a newer version of OpenLight"],
    [{ ...json, format: "openlight" }, "doesn't contain an OpenLight preset"],
    [{ ...json, settings: { texture: {} } }, 'Unrecognized key: "texture"'],
    [
      { ...json, settings: { color: { vibrance: 20 } } },
      "Invalid preset settings.color.saturation",
    ],
    [{ ...json, name: " " }, "Invalid preset name: Name the preset"],
  ] as const;
  for (const [value, message] of malformed) {
    expect(() => readPreset(value)).toThrow(message);
  }

  const records = new Map<string, unknown>([
    ["warm", json],
    ["newer", { ...json, name: "Newer", version: 2 }],
  ]);
  let full = false;
  function write(change: () => void) {
    if (full) {
      throw Error("The quota is exceeded.");
    }
    change();
  }
  const store: PresetStore = {
    read: async () => [...records],
    put: async (id, preset) => write(() => records.set(id, presetJson(preset))),
    delete: async (id) => write(() => records.delete(id)),
  };
  const session = createPresetSession(store);
  const state = () => session.state.getState();
  await session.save("  Cool ", {
    light: {
      exposure: -1,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    },
  });
  expect(state().presets.map(({ name }) => name)).toEqual(["Cool", "Warm"]);
  // A record a newer version wrote stays stored for it.
  expect(state().error).toBe(
    "A stored preset couldn't be read: This preset needs a newer version of OpenLight.",
  );
  expect(records.has("newer")).toBe(true);

  const kept = state().presets;
  full = true;
  await session.save("Blue", warm.settings);
  expect(state().error).toBe("Couldn't save Blue: The quota is exceeded.");
  await session.remove(kept[1]);
  expect(state().error).toBe("Couldn't delete Warm: The quota is exceeded.");
  full = false;
  await session.import(new File(["{"], "broken.openlight-preset"));
  expect(state().error).toBe(
    "Couldn't import broken.openlight-preset: This file doesn't contain an OpenLight preset.",
  );
  expect(state().presets).toBe(kept);
  expect(records.size).toBe(3);

  const imported = new File(
    [JSON.stringify(presetJson({ ...warm, name: "Shared" }))],
    "shared.openlight-preset",
  );
  expect(await readPresetFile(imported)).toEqual({ ...warm, name: "Shared" });
  await session.import(imported);
  await session.remove(kept[1]);
  expect(state().presets.map(({ name }) => name)).toEqual(["Cool", "Shared"]);
});
