import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { resetColorMixer, setColorMixer } from "@/features/color-mixer/edits";
import { defaultMixer } from "@/features/color-mixer/model";

test("color edits validate, skip no-ops, and reset, and a neutral mixer renders no pass", async () => {
  const gpu = await init();
  const image = target(gpu, { size: [32, 16], format: "rgba16float" });
  const source = createImageSource(image);
  const mixer = { ...createLayer("color-mixer"), id: "mixer" };
  const photo = { ...createImageLayer("photo", "Photo"), children: [mixer] };
  const frame = imageFrame(image.size);
  const document = createDocument({ frame, layers: [photo] });
  const renderer = createEditorRenderer(gpu, source);
  const undoCount = () => document.history.status.getState().undoCount;
  const passes = async () => {
    await renderer.update(document.scene.getState());
    return renderer.inspect().passes;
  };
  expect(await passes()).toEqual([]);
  setColorMixer(document, "blue", { hue: 0 }, "mixer");
  resetColorMixer(document, "mixer");
  expect(undoCount()).toBe(0);
  setColorMixer(document, "blue", { hue: 25, saturation: -20 }, "mixer");
  const scene = document.scene.getState();
  // Blue is the sixth range.
  expect(scene.layers[0].children[0]).toMatchObject({
    colorMixer: { hue: { 5: 25 }, saturation: { 5: -20 } },
  });
  expect(await passes()).toEqual(["layer/mixer/color-mixer"]);
  setColorMixer(document, "blue", { hue: 25 }, "mixer");
  expect(undoCount()).toBe(1);
  for (const [color, change] of [
    ["red", { hue: 101 }],
    ["pink", { hue: 2 }],
    ["red", { contrast: 2 }],
  ]) {
    const edit = [document, color, change, "mixer"];
    expect(() => Reflect.apply(setColorMixer, undefined, edit)).toThrow(
      "Invalid",
    );
  }
  expect(document.scene.getState()).toBe(scene);
  resetColorMixer(document, "mixer");
  expect(document.scene.getState().layers[0].children[0]).toMatchObject({
    colorMixer: defaultMixer,
  });
  expect(await passes()).toEqual([]);
  document.history.undo();
  expect(document.scene.getState()).toEqual(scene);
  renderer.dispose();
  document.dispose();
  source.dispose();
  gpu.dispose();
});
