import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createImageLayer } from "@/app/editor/layers";
import { createWorkspace } from "@/app/workspace";
import {
  type ColorRange,
  createDocument,
  createResources,
  findLayer,
  type LuminanceRange,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";

test("commands validate their input, return the layer they edit, and reset as one edit", async () => {
  const gpu = await init();
  const resources = createResources();
  const image = target(gpu, { size: [32, 16], format: "rgba16float" });
  const file = new File([], "photo.png");
  const source = resources.add(file, createImageSource(image));
  const base = { ...createImageLayer(source, "Photo"), id: "base" };
  const frame = imageFrame(image.size);
  const document = createDocument({ frame, layers: [base] }, resources);
  const workspace = createWorkspace();
  await workspace.open("photo.png", async () => document);
  const { run, setVignette } = createControls(gpu, workspace);
  const opened = document.scene.getState();
  const undoCount = () => document.history.status.getState().undoCount;

  expect(() => Reflect.apply(run, undefined, [{ type: "blur" }])).toThrow(
    "Unknown command: blur.",
  );
  expect(() => run({ type: "set-vignette", intensity: 101 })).toThrow(
    "Invalid set-vignette intensity",
  );
  // The edit that would create the layer fails, so the layer is not left behind.
  expect(() => setVignette({ intensity: 101 })).toThrow(
    "Invalid vignette adjustment",
  );
  expect(document.scene.getState()).toBe(opened);

  expect(run({ type: "set-adjustments", exposure: 1 }).layerId).toBe("base");
  const vignette = run({ type: "set-vignette", intensity: 40 }).layerId;
  expect(run({ type: "set-vignette", softness: 80 }).layerId).toBe(vignette);
  const mask = run({
    type: "add-mask",
    mask: { kind: "linear", start: [0, 0], end: [32, 16] },
    adjustments: { exposure: -1 },
  }).layerId;
  expect(document.scene.getState().layers.at(-1)).toMatchObject({
    id: mask,
    adjustments: { exposure: -1 },
  });
  run({ type: "set-crop", aspectRatio: 1 });
  expect(undoCount()).toBe(5);

  const edited = document.scene.getState();
  run({ type: "reset" });
  expect(document.scene.getState()).toEqual(opened);
  expect(undoCount()).toBe(6);
  run({ type: "undo" });
  expect(document.scene.getState()).toEqual(edited);
  workspace.dispose();
});

test("range masks select tones or a color, validate their bounds, and intersect other masks", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [32, 16], format: "rgba16float" }),
  );
  const resources = createResources();
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(source.image.size),
      layers: [createImageLayer(sourceId, "Photo")],
    },
    resources,
  );
  const workspace = createWorkspace();
  await workspace.open("photo.png", async () => document);
  const api = createControls(gpu, workspace);
  const layer = (id: string) => findLayer(document.scene.getState().layers, id);

  const shadows: LuminanceRange = {
    kind: "luminance-range",
    low: 0,
    high: 30,
    smoothness: 10,
  };
  const { layerId = "" } = api.run({
    type: "add-mask",
    mask: shadows,
    adjustments: { exposure: 1 },
  });
  expect(layer(layerId)).toMatchObject({
    name: "Luminance Range",
    mask: shadows,
    adjustments: { exposure: 1 },
  });
  expect(() =>
    api.run({ type: "add-mask", mask: { ...shadows, low: 40 } }),
  ).toThrow("A luminance range needs low at or below high");

  // A color range inside the luminance range keeps only the shadows of that color.
  const blue: ColorRange = {
    kind: "color-range",
    color: "#6FA8DC",
    tolerance: 30,
  };
  const child = api.addLayer("mask", { inside: layerId });
  api.setLayerMask(child, blue);
  api.setMaskOperation(child, "intersect");
  expect(layer(child)).toMatchObject({
    mask: { ...blue, color: "#6fa8dc" },
    operation: "intersect",
  });
  api.setLayerMask(child, { ...blue, color: null });
  expect(layer(child)).toMatchObject({
    mask: { kind: "color-range", color: null },
  });
  expect(() =>
    Reflect.apply(api.setMaskOperation, undefined, [child, "union"]),
  ).toThrow("Invalid mask operation");
  expect(document.history.status.getState().undoCount).toBe(5);
});
