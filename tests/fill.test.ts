import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import {
  createImageLayer,
  createLayer,
  createMask,
  maskNeutral,
} from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument, findLayer } from "@/core/document";
import { createImageSource } from "@/core/image";
import { parseColor } from "@/core/image/blend";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { setFill } from "@/features/fill/edits";
import { addLayer, setLayer } from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";

test("a color layer renders its fill, validates its settings, and keeps a mask from looking neutral", async () => {
  const gpu = await init();
  const image = target(gpu, { size: [16, 8], format: "rgba16float" });
  const layers = [createImageLayer("photo", "Photo")] as const;
  const document = createDocument({ frame: imageFrame(image.size), layers });
  const source = createImageSource(image);
  const renderer = createEditorRenderer(gpu, source);
  expect(parseColor("#ff8000")).toEqual([1, 128 / 255, 0]);
  const mask = addLayer(document, createMask(defaultGradient([16, 8])));
  const neutral = () => {
    const layer = findLayer(document.scene.getState().layers, mask);
    return layer?.kind === "mask" && maskNeutral(layer);
  };
  expect(neutral()).toBe(true);
  const fill = addLayer(document, createLayer("fill"), { inside: mask });
  expect(neutral()).toBe(false);
  await renderer.update(document.scene.getState());
  expect(renderer.inspect().passes).toEqual([
    `layer/${fill}/fill`,
    `layer/${mask}/mix`,
  ]);
  setFill(document, { color: "#00FF00", blend: "multiply" }, fill);
  expect(findLayer(document.scene.getState().layers, fill)).toMatchObject({
    fill: { color: "#00ff00", blend: "multiply" },
  });
  for (const change of [{ color: "#12345" }, { blend: "darken" }]) {
    expect(() =>
      Reflect.apply(setFill, undefined, [document, change, fill]),
    ).toThrow("Invalid fill");
  }
  expect(() => setFill(document, { color: "#000000" }, mask)).toThrow(
    "color layer",
  );
  // A hidden fill leaves the mask neutral; an adjustment does not.
  setLayer(document, fill, { visible: false });
  expect(neutral()).toBe(true);
  setAdjustments(document, { contrast: 5 }, mask);
  expect(neutral()).toBe(false);
  renderer.dispose();
  document.dispose();
  source.dispose();
  gpu.dispose();
});
