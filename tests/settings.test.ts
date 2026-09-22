import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createImageLayer } from "@/app/editor/layers";
import { createWorkspace, type Workspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import { createImageSource, type WhiteBalance } from "@/core/image";
import { imageFrame, type Point } from "@/core/image/frame";

const asShot = { temperature: 5000, tint: 10 };

async function openImage(
  workspace: Workspace,
  name: string,
  size: Point,
  balance?: WhiteBalance,
) {
  const gpu = await init();
  await workspace.open(name, async () => {
    const image = target(gpu, { size, format: "rgba16float" });
    const raw = balance && {
      asShot: balance,
      createPass(): never {
        throw Error("Not rendered.");
      },
      dispose() {},
    };
    const resources = createResources();
    const source = resources.add(
      new File([], name),
      createImageSource(image, raw),
    );
    return createDocument(
      {
        frame: imageFrame(size),
        layers: [createImageLayer(source, name, balance)],
      },
      resources,
    );
  });
  return workspace.getDocument();
}

test("settings files restore every layer on an image of the same size as one undoable edit", async () => {
  const workspace = createWorkspace();
  const api = createControls(await init(), workspace);
  try {
    await openImage(workspace, "photo.nef", [64, 32], asShot);
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
    api.addLayer("details", { inside: mask });
    api.setDetails(
      { clarity: 30 },
      api.getState().scene?.layers[1].children[0].id,
    );
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
      {
        mode: "paint",
        size: 4,
        feather: 0.2,
        flow: 1,
        points: [[40, 20, 1]],
      },
      [-6, 2],
    );
    api.setFill({ color: "#123456", blend: "soft-light" });
    const fill = api.getState().scene?.layers.at(-1)?.id ?? "";
    api.setLayer(fill, { name: "Warm", opacity: 0.5, visible: false });
    api.setVignette({ intensity: 70, softness: 20 });
    api.setColorMixer("blue", { hue: 20, luminance: -10 });
    api.setExposure(api.addLayer("exposure"), -0.5);
    const edited = api.getState().scene;
    if (!edited) throw Error("Missing edited scene.");

    const file = api.exportSettings();
    expect(file.name).toBe("photo.openlight");
    const settings = JSON.parse(await file.text());
    expect(settings).toMatchObject({
      format: "openlight",
      version: 1,
      image: { name: "photo.nef", size: [64, 32] },
    });
    expect(settings.scene.layers[0]).not.toHaveProperty("source");

    const copy = await openImage(workspace, "copy.nef", [64, 32], asShot);
    const fresh = copy.scene.getState();
    await api.openFiles([file]);
    const [image] = fresh.layers;
    const [original, ...layers] = edited.layers;
    expect(copy.scene.getState()).toEqual({
      ...edited,
      layers: [
        { ...original, name: image.name, source: image.source },
        ...layers,
      ],
    });
    expect(copy.history.status.getState().undoCount).toBe(1);

    const invalid: [unknown, string][] = [
      [{ ...settings, format: "other" }, "doesn't contain OpenLight settings"],
      [{ ...settings, version: 2 }, "need a newer version"],
      [
        { ...settings, image: { size: [32, 64] } },
        "These settings are for a 32 × 64 image, not 64 × 32.",
      ],
      [
        {
          ...settings,
          scene: {
            ...settings.scene,
            layers: [...settings.scene.layers, settings.scene.layers[1]],
          },
        },
        "IDs must be unique",
      ],
      [
        {
          ...settings,
          scene: {
            ...settings.scene,
            layers: [
              ...settings.scene.layers,
              { ...settings.scene.layers[2], id: "new", kind: "text" },
            ],
          },
        },
        "Unknown layer kind: text.",
      ],
    ];
    for (const [value, message] of invalid) {
      await expect(
        api.importSettings(
          new File([JSON.stringify(value)], "invalid.openlight"),
        ),
      ).rejects.toThrow(message);
    }
    expect(copy.history.status.getState().undoCount).toBe(1);
    copy.history.undo();
    expect(copy.scene.getState()).toBe(fresh);

    // A parameter missing from a group takes its default, as in a file older than that parameter.
    const vignette = settings.scene.layers.find(
      (layer: { kind: string }) => layer.kind === "vignette",
    );
    delete vignette.vignette.softness;
    const jpeg = await openImage(workspace, "copy.jpg", [64, 32]);
    await api.importSettings(
      new File([JSON.stringify(settings)], "older.openlight"),
    );
    const loaded = jpeg.scene.getState();
    expect(loaded.layers[0].whiteBalance).toBeUndefined();
    expect(loaded.layers[0].adjustments).toEqual(edited.layers[0].adjustments);
    expect(
      loaded.layers.find((layer) => layer.kind === "vignette"),
    ).toMatchObject({ vignette: { intensity: 70, softness: 50 } });
  } finally {
    workspace.dispose();
  }
});
