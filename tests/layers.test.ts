import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createWorkspace } from "@/app/workspace";
import {
  createDocument,
  createResources,
  findLayer,
  walkLayers,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setExposure } from "@/features/adjustments/edits";
import {
  addLayer,
  deleteLayer,
  duplicateLayer,
  moveLayer,
  setLayer,
  setLayerMask,
} from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";

test("nested layers compose in order, move atomically, and duplicate with independent IDs", async () => {
  const gpu = await init();
  const image = target(gpu, { size: [32, 16], format: "rgba16float" });
  const source = createImageSource(image);
  const resources = createResources();
  const sourceId = resources.add(new File([], "photo.png"), source);
  const base = { ...createImageLayer(sourceId, "Photo"), id: "base" };
  const frame = imageFrame(image.size);
  const document = createDocument({ frame, layers: [base] }, resources);
  const workspace = createWorkspace();
  await workspace.open("photo.png", async () => document);
  const controls = createControls(gpu, workspace);
  const renderer = createEditorRenderer(gpu, source);
  const scene = () => document.scene.getState();
  const find = (id: string) => findLayer(scene().layers, id);
  const childIds = (id: string) => find(id)?.children.map((layer) => layer.id);
  const original = scene();
  controls.beginEdit();
  controls.setAdjustments({ exposure: 1 });
  controls.setColorMixer("blue", { saturation: -20 });
  expect(() => controls.setToneCurve([])).toThrow();
  controls.cancelEdit();
  expect(scene()).toEqual(original);
  expect(document.history.status.getState().undoCount).toBe(0);
  controls.setVignette({ softness: 75 });
  expect(scene().layers[1]).toMatchObject({
    vignette: { intensity: 50, softness: 75 },
  });
  controls.undo();
  for (const change of [{ size: [] }, { center: [8, NaN] }, { angle: NaN }]) {
    expect(() =>
      Reflect.apply(controls.setFrame, undefined, [{ ...frame, ...change }]),
    ).toThrow("Invalid image frame");
  }
  expect(scene().frame).toBe(original.frame);
  const crop = { ...frame, size: [8, 8] as [number, number] };
  controls.setFrame(crop);
  const cropped = scene();
  crop.size[0] = 99;
  expect(cropped.frame.size).toEqual([8, 8]);
  // An edit equal in value keeps the scene.
  controls.setFrame(structuredClone(cropped.frame));
  expect(scene()).toBe(cropped);
  // A new mask's gradient spans the cropped frame.
  expect(find(controls.addLayer("mask"))).toMatchObject({
    mask: { start: [6.4, 8], end: [25.6, 8] },
  });
  controls.undo();
  controls.undo();
  const mask = addLayer(document, createMask(defaultGradient([32, 16])));
  const inside = { inside: mask };
  const exposure = addLayer(document, createLayer("exposure"), inside);
  const vignette = addLayer(document, createLayer("vignette"), inside);
  expect(scene().layers[0]).toBe(original.layers[0]);
  document.history.begin();
  setExposure(document, exposure, 2);
  setExposure(document, exposure, 3);
  document.selectLayer("base");
  document.history.undo();
  expect(find(exposure)).toMatchObject({ exposure: 1 });
  expect(document.selection.getState().layerId).toBe("base");
  await renderer.update(scene());
  expect(renderer.inspect().passes).toEqual([
    `layer/${exposure}/exposure`,
    `layer/${vignette}/vignette`,
    `layer/${mask}/mix`,
  ]);
  const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
  const compiled = calls.createRenderPipeline;
  setLayer(document, mask, { visible: false });
  await renderer.update(scene());
  expect(renderer.inspect().passes).toEqual([]);
  setLayer(document, mask, { visible: true, opacity: 0.5 });
  await renderer.update(scene());
  expect(calls.createRenderPipeline).toBe(compiled);
  const duplicate = duplicateLayer(document, mask);
  expect(find(duplicate)?.children.map((layer) => layer.kind)).toEqual([
    "exposure",
    "vignette",
  ]);
  const ids = Array.from(walkLayers(scene().layers), ({ layer }) => layer.id);
  expect(new Set(ids).size).toBe(ids.length);
  moveLayer(document, exposure, 1);
  expect(scene().layers[1].id).toBe(exposure);
  expect(childIds(mask)).toEqual([vignette]);
  document.history.undo();
  expect(childIds(mask)).toEqual([exposure, vignette]);
  const unchanged = scene();
  expect(() =>
    addLayer(document, createLayer("vignette"), { inside: exposure }),
  ).toThrow("two levels");
  expect(() => moveLayer(document, mask, 0, exposure)).toThrow("itself");
  expect(() => moveLayer(document, exposure, 0, "base")).toThrow("image");
  expect(() => moveLayer(document, exposure, 0)).toThrow("position");
  expect(() =>
    setLayerMask(document, mask, {
      kind: "linear",
      start: [0, 0],
      end: [0, 0],
    }),
  ).toThrow("distinct");
  expect(() => setExposure(document, exposure, NaN)).toThrow("Exposure");
  expect(() => deleteLayer(document, "base")).toThrow("unavailable");
  expect(scene()).toBe(unchanged);
  const added = addLayer(document, createLayer("vignette"), {
    above: exposure,
  });
  expect(childIds(mask)).toEqual([exposure, added, vignette]);
  const top = addLayer(document, createLayer("vignette"));
  expect(scene().layers.at(-1)?.id).toBe(top);
  expect(() =>
    addLayer(document, createLayer("vignette"), { above: "missing" }),
  ).toThrow("unavailable");
  document.selectLayer(exposure);
  await renderer.update(scene());
  const retained = renderer.inspect().effects;
  deleteLayer(document, mask);
  // A deleted layer's passes, and those of its children, leave with it; its duplicate keeps its own.
  await renderer.update(scene());
  const { effects, passes } = renderer.inspect();
  expect(effects).toBeLessThan(retained);
  expect(effects).toBe(passes.length);
  expect(document.selection.getState().layerId).toBe("base");
  expect(find(exposure)).toBeUndefined();
  document.history.undo();
  expect(find(exposure)).toBeDefined();
  renderer.dispose();
  workspace.dispose();
  gpu.dispose();
});
