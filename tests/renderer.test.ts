import { expect, mock, test } from "bun:test";
import type { Target } from "vgpu";
import {
  frame,
  getMockGPUDeviceInstrumentation,
  init,
  target,
} from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer as createRenderer } from "@/app/editor/renderer";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import {
  createDisplay,
  createRenderGraph,
  input,
  pipeline,
} from "@/core/renderer";
import { setAdjustments } from "@/features/adjustments/edits";
import { defaultAdjustments } from "@/features/adjustments/model";
import { unsharpMask } from "@/features/details/unsharp-mask";
import { setToneCurve } from "@/features/tone-curves/edits";
import { setWhiteBalance } from "@/features/white-balance/edits";

test("RAW edits coalesce, recover from failure, and retain an exporting source after document replacement", async () => {
  const gpu = await init();
  const image = target(gpu, { size: [8, 8], format: "rgba16float" });
  const asShot = { temperature: 5000, tint: 10 };
  const requests: ReturnType<typeof Promise.withResolvers<void>>[] = [];
  const outputs: Target[] = [];
  const started = Promise.withResolvers<void>();
  const close = mock(() => {});
  const develop = mock(() => {
    requests.push(Promise.withResolvers<void>());
    started.resolve();
    return requests[requests.length - 1].promise;
  });
  const source = createImageSource(image, {
    asShot,
    createPass() {
      const output = target(gpu, { size: image.size, format: image.format });
      outputs.push(output);
      return {
        prepare: ({ temperature }) =>
          temperature === asShot.temperature ? Promise.resolve() : develop(),
        render: () => output,
        dispose: () => output.color.dispose(),
      };
    },
    dispose: close,
  });
  const resources = createResources();
  const id = resources.add(new File([], "photo.nef"), source);
  const layers = [createImageLayer(id, "Photo", asShot)] as const;
  const document = createDocument(
    { frame: imageFrame(image.size), layers },
    resources,
  );
  const preview = createRenderer(gpu, source);
  const exported = createRenderer(gpu, source);
  const notify = mock(() => {});
  preview.subscribe(notify);
  const render = () => preview.update(document.scene.getState());
  // An edit in the same tick as the initial render must not be lost.
  const initial = render();
  setWhiteBalance(document, { temperature: 2000 });
  render();
  await started.promise;
  setWhiteBalance(document, { temperature: 3000 });
  render();
  setWhiteBalance(document);
  render();
  requests[0].resolve();
  await initial;
  // Only the first edit developed; the ones queued behind it collapsed into the last.
  expect(develop).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledTimes(2);
  document.history.undo();
  const failed = render();
  requests[1].reject(Error("Decode failure"));
  await expect(failed).rejects.toThrow("Decode failure");
  const superseded = render();
  setWhiteBalance(document);
  render();
  requests[2].reject(Error("Superseded failure"));
  await superseded;
  setWhiteBalance(document, { temperature: 6500 });
  const recovered = render();
  requests[3].resolve();
  await recovered;
  expect(() => setWhiteBalance(document, { temperature: NaN })).toThrow(
    "Invalid",
  );
  const exporting = exported.update(document.scene.getState());
  preview.dispose();
  document.dispose();
  expect(close).not.toHaveBeenCalled();
  requests[4].resolve();
  await exporting;
  expect(exported.outputImage().size).toEqual([8, 8]);
  exported.dispose();
  expect(close).toHaveBeenCalledTimes(1);
  for (const destroyed of [image, ...outputs]) {
    expect(() => destroyed.color.view).toThrow("destroyed");
  }
  gpu.dispose();
});

test.each([1, 16])(
  "unsharp mask at reduction %s bypasses zero and shares graph storage",
  async (reduction) => {
    const gpu = await init();
    const source = target(gpu, { size: [127, 65], format: "rgba16float" });
    const graph = createRenderGraph(gpu);
    const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
    const radius = reduction === 1 ? 1 : 64;
    const render = (amount: number) =>
      graph.render([
        pipeline(input(source), [
          unsharpMask("detail", amount / 200, radius, reduction),
        ]),
      ])[0];
    expect(render(0)).toBe(source);
    expect(calls.createRenderPipeline ?? 0).toBe(0);
    const filtered = render(100);
    expect(filtered).not.toBe(source);
    expect(filtered.size).toEqual(source.size);
    expect(graph.inspect().textures).toHaveLength(reduction === 1 ? 2 : 3);
    const pipelines = calls.createRenderPipeline;
    expect(render(-100)).toBe(filtered);
    expect(render(25)).toBe(filtered);
    expect(calls.createRenderPipeline).toBe(pipelines);
    expect(render(0)).toBe(source);
    expect(graph.inspect().textures).toHaveLength(0);
    gpu.dispose();
  },
);

test("rendering follows grouped edits and undo, reuses pipelines, and releases owned targets", async () => {
  const gpu = await init();
  const source = target(gpu, { size: [32, 16], format: "rgba16float" });
  const canvas = Object.assign(target(gpu, { size: [64, 32] }), { dpr: 2 });
  const adjustments = { ...defaultAdjustments, exposure: 0.25 };
  const image = { ...createImageLayer("photo", "Photo"), id: "base" };
  const layers = [{ ...image, adjustments }] as const;
  const document = createDocument({ frame: imageFrame([32, 16]), layers });
  const resource = createImageSource(source);
  const renderer = createRenderer(gpu, resource);
  const notify = mock(() => {});
  const detach = renderer.subscribe(notify);
  document.scene.subscribe((scene) => renderer.update(scene));
  const display = createDisplay(gpu);
  const draw = () =>
    frame(gpu, (frame) =>
      display(frame, canvas, renderer.outputImage(), {
        view: { pan: [4, 8], zoom: 2 },
      }),
    );
  const passes = () => renderer.inspect().passes;
  renderer.update(document.scene.getState());
  const adjusted = renderer.outputImage();
  document.history.begin();
  setAdjustments(document, { exposure: 0.5 });
  setAdjustments(document, { exposure: 1 });
  setToneCurve(document, [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.7 },
    { x: 1, y: 1 },
  ]);
  document.history.commit();
  const curved = renderer.outputImage();
  expect(curved).not.toBe(adjusted);
  draw();
  const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
  const pipelines = calls.createRenderPipeline;
  expect(pipelines).toBeGreaterThan(0);
  const late = mock(() => {});
  renderer.subscribe(late)();
  expect(late).toHaveBeenCalledTimes(1);
  document.history.undo();
  expect(renderer.outputImage()).toBe(adjusted);
  expect(document.scene.getState().layers[0].adjustments.exposure).toBe(0.25);
  document.history.redo();
  const curves = ["layer/base/exposure", "layer/base/curves"];
  expect(passes()).toEqual(curves);
  document.history.begin();
  setToneCurve(document);
  expect(renderer.outputImage()).toBe(adjusted);
  document.history.cancel();
  expect(passes()).toEqual(curves);
  draw();
  expect(calls.createRenderPipeline).toBe(pipelines);
  detach();
  const beforeInput = document.scene.getState();
  const base = beforeInput.layers[0];
  const exposure = { ...createLayer("exposure"), id: "exposure" };
  document.edit({
    ...beforeInput,
    layers: [{ ...base, children: [exposure, ...base.children] }],
  });
  await renderer.update(document.scene.getState(), "base");
  expect(renderer.inputImage("base")).toBeDefined();
  expect(renderer.inputImage("base")).not.toBe(renderer.outputImage());
  expect(passes()).toEqual([...curves, "layer/exposure/exposure"]);
  document.edit(beforeInput);
  expect(renderer.inputImage("base")).toBeUndefined();
  const scene = document.scene.getState();
  const details = { clarity: 50, sharpening: 100, sharpenRadius: 2 };
  document.edit({
    ...scene,
    layers: [...scene.layers, { ...createLayer("details"), details }],
  });
  // Eight renders reached the listener before it detached.
  expect(notify).toHaveBeenCalledTimes(8);
  document.edit({
    ...document.scene.getState(),
    frame: { ...scene.frame, size: [16, 8], angle: 10 },
  });
  const croppedOutput = renderer.outputImage();
  expect(croppedOutput.size).toEqual([16, 8]);
  renderer.dispose();
  for (const owned of [croppedOutput, adjusted, curved]) {
    expect(() => owned.color.view).toThrow("destroyed");
  }
  expect(() => source.color.view).not.toThrow();
  gpu.dispose();
});
