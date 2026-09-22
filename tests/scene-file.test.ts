import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createImageLayer } from "@/app/editor/layers";
import { openSceneFile } from "@/app/scene-file";
import { createWorkspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import { createImageSource, type WhiteBalance } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { readZip, writeZip } from "@/lib/zip";

const asShot = { temperature: 5000, tint: 10 };
const size = [64, 32] as const;
const bytes = new Uint8Array(4096).map((_, index) => index * 7);

async function decoder(balance?: WhiteBalance) {
  const gpu = await init();
  const decoded: File[] = [];
  function decode(file: File) {
    decoded.push(file);
    const raw = balance && {
      asShot: balance,
      createPass(): never {
        throw Error("Not rendered.");
      },
      dispose() {},
    };
    return Promise.resolve(
      createImageSource(target(gpu, { size, format: "rgba16float" }), raw),
    );
  }
  return { decode, decoded };
}

test("scene files reopen the photo with every layer for further editing", async () => {
  const workspace = createWorkspace();
  const api = createControls(await init(), workspace);
  const raw = await decoder(asShot);
  try {
    await workspace.open("photo.nef", async () => {
      const file = new File([bytes], "photo.nef", {
        type: "image/x-nikon-nef",
      });
      const resources = createResources();
      const source = resources.add(file, await raw.decode(file));
      return createDocument(
        {
          frame: imageFrame(size),
          layers: [createImageLayer(source, "photo.nef", asShot)],
        },
        resources,
      );
    });
    api.setAdjustments({ exposure: 1, contrast: 20 });
    api.setWhiteBalance({ temperature: 6500 });
    api.setToneCurve([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 },
    ]);
    api.setFrame({
      center: [30, 16],
      size: [40, 24],
      rotation: 90,
      angle: 5,
      scale: [-1, 1],
    });
    const mask = api.addLayer("mask");
    api.setLayerMask(mask, {
      kind: "brush",
      strokes: [
        {
          mode: "paint",
          size: 6,
          feather: 0.5,
          flow: 0.8,
          points: [
            [10.25, 8, 1],
            [20, 12.5, 0.5],
          ],
        },
      ],
    });
    api.setAdjustments({ shadows: 40 }, mask);
    api.setDetails({ clarity: 30 }, api.addLayer("details", { inside: mask }));
    const subtract = api.addLayer("mask", { inside: mask });
    api.setLayerMask(subtract, {
      kind: "radial",
      center: [16, 16],
      radius: [8, 6],
      angle: 30,
      feather: 0.4,
    });
    api.setMaskOperation(subtract, "subtract");
    const heal = api.addLayer("heal");
    api.addHealPatch(
      heal,
      { mode: "paint", size: 4, feather: 0.2, flow: 1, points: [[40, 20, 1]] },
      [-6, 2],
    );
    api.setFill({ color: "#123456", blend: "soft-light" });
    const fill = api.getState().scene?.layers.at(-1)?.id ?? "";
    api.setLayer(fill, { name: "Warm", opacity: 0.5, visible: false });
    api.setVignette({ intensity: 70, softness: 20 });
    api.setColorMixer("blue", { hue: 20, luminance: -10 });
    api.setExposure(api.addLayer("exposure"), -0.5);
    const edited = workspace.getDocument().scene.getState();

    const file = await api.exportScene();
    expect(file.name).toBe("photo.openlight");
    const entries = await readZip(file);
    const json = JSON.parse((await entries.get("scene.json")?.text()) ?? "");
    const { source } = edited.layers[0];
    expect(json).toMatchObject({
      format: "openlight",
      version: 1,
      sources: { [source]: { name: "photo.nef", type: "image/x-nikon-nef" } },
      scene: edited,
    });
    const stored = await entries.get(`sources/${source}`)?.bytes();
    expect(stored).toEqual(bytes);

    const opened = await openSceneFile(file, raw.decode);
    const reopened = raw.decoded.at(-1);
    expect(reopened?.name).toBe("photo.nef");
    expect(reopened?.type).toBe("image/x-nikon-nef");
    expect(await reopened?.bytes()).toEqual(bytes);
    const [image, ...layers] = edited.layers;
    const scene = opened.scene.getState();
    expect(scene).toEqual({
      ...edited,
      layers: [{ ...image, source: scene.layers[0].source }, ...layers],
    });
    expect(opened.history.status.getState().undoCount).toBe(0);
    opened.dispose();

    async function archive(value: unknown, sources = entries) {
      return writeZip([
        { name: "scene.json", data: new Blob([JSON.stringify(value)]) },
        ...[...sources]
          .filter(([name]) => name !== "scene.json")
          .map(([name, data]) => ({ name, data })),
      ]);
    }
    const invalid: [Blob, string][] = [
      [new Blob(["not a zip"]), "Not a ZIP archive."],
      [
        await archive({ ...json, format: "other" }),
        "doesn't contain an OpenLight scene",
      ],
      [await archive({ ...json, version: 2 }), "needs a newer version"],
      [await archive(json, new Map()), "The scene's image is missing."],
      [
        await archive({
          ...json,
          scene: {
            ...json.scene,
            layers: [...json.scene.layers, json.scene.layers[1]],
          },
        }),
        "IDs must be unique",
      ],
      [
        await archive({
          ...json,
          scene: {
            ...json.scene,
            layers: [
              ...json.scene.layers,
              { ...json.scene.layers[2], id: "new", kind: "text" },
            ],
          },
        }),
        "Unknown layer kind: text.",
      ],
    ];
    for (const [value, message] of invalid) {
      await expect(openSceneFile(value, raw.decode)).rejects.toThrow(message);
    }

    // A parameter missing from a group takes its default, as in a file older than that parameter.
    const vignette = json.scene.layers.find(
      (layer: { kind: string }) => layer.kind === "vignette",
    );
    delete vignette.vignette.softness;
    delete json.scene.layers[0].whiteBalance;
    const older = await openSceneFile(await archive(json), raw.decode);
    const loaded = older.scene.getState();
    expect(loaded.layers[0].whiteBalance).toEqual(asShot);
    expect(
      loaded.layers.find((layer) => layer.kind === "vignette"),
    ).toMatchObject({ vignette: { intensity: 70, softness: 50 } });
    older.dispose();
  } finally {
    workspace.dispose();
  }
});
