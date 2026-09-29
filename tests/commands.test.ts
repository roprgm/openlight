import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createImageLayer } from "@/app/editor/layers";
import { createWorkspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";

test("commands validate their input, return the layer they edit, and reset as one edit", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [32, 16], format: "rgba16float" }),
  );
  const resources = createResources();
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(source.image.size),
      layers: [{ ...createImageLayer(sourceId, "Photo"), id: "base" }],
    },
    resources,
  );
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
  expect(undoCount()).toBe(0);

  expect(run({ type: "set-adjustments", exposure: 1 })).toEqual({
    layerId: "base",
  });
  const vignette = run({ type: "set-vignette", intensity: 40 }).layerId;
  expect(run({ type: "set-vignette", softness: 80 }).layerId).toBe(vignette);
  const mask = run({
    type: "add-mask",
    mask: {
      kind: "radial",
      center: [16, 8],
      radius: [8, 4],
      angle: 0,
      feather: 0.5,
    },
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
});
