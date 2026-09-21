import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import {
  createImageLayer,
  createLayer,
  createMask,
  maskNeutral,
} from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument, createResources, findLayer } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { setFill } from "@/features/fill/edits";
import { parseColor } from "@/features/fill/model";
import { addLayer, setLayer } from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";

test("a color layer renders its fill, validates its settings, and keeps a mask from looking neutral", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [16, 8], format: "rgba16float" }),
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
  const renderer = createEditorRenderer(gpu, source);
  try {
    expect(parseColor("#ff8000")).toEqual([1, 128 / 255, 0]);
    const mask = addLayer(document, createMask(defaultGradient([16, 8])));
    const layer = () => {
      const item = findLayer(document.scene.getState().layers, mask);
      if (item?.kind !== "mask") {
        throw Error("Mask is missing.");
      }
      return item;
    };
    expect(maskNeutral(layer())).toBe(true);
    const fill = addLayer(document, createLayer("fill"), { inside: mask });
    expect(maskNeutral(layer())).toBe(false);
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().passes).toEqual([
      `layer/${fill}/fill`,
      `layer/${mask}/mix`,
    ]);
    setFill(document, { color: "#00FF00", blend: "multiply" }, fill);
    expect(findLayer(document.scene.getState().layers, fill)).toMatchObject({
      fill: { color: "#00ff00", blend: "multiply" },
    });
    for (const change of [
      { color: "red" },
      { color: "#12345" },
      { blend: "darken" as "normal" },
    ]) {
      expect(() => setFill(document, change, fill)).toThrow("Invalid fill");
    }
    expect(() => setFill(document, { color: "#000000" }, mask)).toThrow(
      "color layer",
    );
    // A hidden fill leaves the mask neutral; an adjustment does not.
    setLayer(document, fill, { visible: false });
    expect(maskNeutral(layer())).toBe(true);
    setAdjustments(document, { contrast: 5 }, mask);
    expect(maskNeutral(layer())).toBe(false);
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});
