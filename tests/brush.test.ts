import { expect, mock, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { BrushStroke } from "@/core/document";
import { createDocument, createResources, findLayer } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { strokeDabs } from "@/core/renderer/mask/dabs";
import { setAdjustments } from "@/features/adjustments/edits";
import {
  addLayer,
  deleteLayer,
  extendStroke,
  paintStroke,
  setLayer,
  setLayerMask,
} from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";

const stroke: BrushStroke = {
  mode: "paint",
  size: 8,
  feather: 0.5,
  flow: 0.5,
  points: [[10, 10, 1]],
};

test("dabs follow the stroke at a quarter diameter with interpolated pressure", () => {
  expect(strokeDabs(stroke)).toEqual([[10, 10, 4, 0.5]]);
  const line = strokeDabs({
    ...stroke,
    points: [
      [10, 10, 1],
      [20, 10, 0.5],
      [30, 10, 0],
    ],
  });
  expect(line).toHaveLength(11);
  expect(line[0]).toEqual([10, 10, 4, 0.5]);
  expect(line[5]).toEqual([20, 10, 4, 0.25]);
  expect(line[10][0]).toBeCloseTo(30);
  expect(line[10][3]).toBeCloseTo(0);
  expect(strokeDabs({ ...stroke, points: [] })).toEqual([]);
});

test("brush strokes stamp incrementally, replay after undo, and render a proxy during gestures", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [64, 32], format: "rgba16float" }),
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
  const notify = mock(() => {});
  renderer.subscribe(notify);
  const render = (interactive = false) =>
    renderer.update(document.scene.getState(), undefined, interactive);
  try {
    const mask = addLayer(document, createMask({ kind: "brush", strokes: [] }));
    setAdjustments(document, { exposure: 1 }, mask);
    await render();
    // An empty brush covers nothing, so the layer is bypassed without a raster.
    expect(renderer.inspect()).toMatchObject({
      passes: [],
      stamped: 0,
      rasters: [],
    });
    expect(document.history.status.getState().editing).toBe(false);
    expect(document.history.begin()).toBe(true);
    expect(document.history.status.getState().editing).toBe(true);
    paintStroke(document, mask, stroke);
    await render(true);
    expect(renderer.inspect()).toMatchObject({
      passes: [`layer/${mask}/exposure`, `layer/${mask}/raster`],
      stamped: 1,
      rasters: [{ id: mask, size: [64, 32] }],
    });
    expect(renderer.coverage(mask)?.size).toEqual([64, 32]);
    // A 20 px extension adds ten dabs; earlier ones are not stamped again.
    extendStroke(document, mask, [[30, 10, 1]]);
    await render(true);
    expect(renderer.inspect().stamped).toBe(11);
    expect(renderer.outputImage().size).toEqual([64, 32]);
    // The display scale sets the proxy: a quarter of a device pixel per source pixel means a quarter-size render.
    renderer.setDisplayScale(0.25);
    await render(true);
    expect(renderer.outputImage().size).toEqual([16, 8]);
    expect(renderer.inspect().stamped).toBe(11);
    document.history.commit();
    expect(document.history.status.getState().editing).toBe(false);
    await render();
    expect(renderer.outputImage().size).toEqual([64, 32]);
    const rendered = notify.mock.calls.length;
    await render();
    expect(notify).toHaveBeenCalledTimes(rendered);
    paintStroke(document, mask, { ...stroke, mode: "erase" });
    await render();
    expect(renderer.inspect().stamped).toBe(12);
    // Undo removes the last stroke, which rebuilds the raster from the remaining one.
    document.history.undo();
    await render();
    expect(renderer.inspect().stamped).toBe(23);
    const layer = findLayer(document.scene.getState().layers, mask);
    expect(layer?.kind === "mask" && layer.mask.kind === "brush").toBe(true);
    if (layer?.kind === "mask" && layer.mask.kind === "brush") {
      expect(layer.mask.strokes).toHaveLength(1);
      expect(layer.mask.strokes[0].points).toHaveLength(2);
    }
    // A brush subtracting from a gradient turns the whole mask into a raster.
    const gradient = addLayer(document, createMask(defaultGradient([64, 32])));
    setAdjustments(document, { exposure: -1 }, gradient);
    await render();
    expect(renderer.inspect().passes).toContain(`layer/${gradient}/mix`);
    // Inspecting the mask copies its curve input with coverage as alpha, even at zero opacity.
    await renderer.update(document.scene.getState(), gradient);
    expect(renderer.inputImage(gradient)).toBeDefined();
    expect(renderer.inspect().passes).toContain(`layer/${gradient}/input`);
    setLayer(document, gradient, { opacity: 0 });
    await renderer.update(document.scene.getState(), gradient);
    expect(renderer.inputImage(gradient)).toBeDefined();
    expect(renderer.inspect().passes).toEqual([
      `layer/${mask}/exposure`,
      `layer/${mask}/raster`,
      `layer/${gradient}/exposure`,
      `layer/${gradient}/input`,
    ]);
    setLayer(document, gradient, { opacity: 1 });
    const child = addLayer(
      document,
      createMask({ kind: "brush", strokes: [stroke] }, "subtract"),
      { inside: gradient },
    );
    await render();
    expect(renderer.inspect().passes).toContain(`layer/${gradient}/raster`);
    expect(renderer.inspect().passes).not.toContain(`layer/${gradient}/mix`);
    await renderer.update(document.scene.getState(), gradient);
    expect(renderer.inspect().passes).toContain(
      `layer/${gradient}/raster-input`,
    );
    // The child keeps its own coverage for its preview; the gradient combines it into a second texture.
    expect(renderer.inspect().rasters.map((raster) => raster.id)).toEqual([
      mask,
      child,
      `${gradient}/group`,
    ]);
    expect(renderer.coverage(child)?.size).toEqual([64, 32]);
    // Erasing inside the child stamps its own raster only, and the group recombines.
    const stampedBefore = renderer.inspect().stamped;
    paintStroke(document, child, { ...stroke, mode: "erase" });
    await render();
    expect(renderer.inspect().stamped).toBe(stampedBefore + 1);
    deleteLayer(document, child);
    deleteLayer(document, mask);
    await render();
    expect(renderer.inspect().rasters).toEqual([]);
    expect(renderer.inspect().passes).toContain(`layer/${gradient}/mix`);
    for (const invalid of [
      { ...stroke, size: 0 },
      { ...stroke, feather: 2 },
      { ...stroke, flow: -1 },
      { ...stroke, mode: "smudge" as BrushStroke["mode"] },
      { ...stroke, points: [] },
      { ...stroke, points: [[1, 2, 3]] as BrushStroke["points"] },
    ]) {
      expect(() =>
        setLayerMask(document, gradient, { kind: "brush", strokes: [invalid] }),
      ).toThrow();
    }
    expect(() => extendStroke(document, gradient, [[1, 1, 1]])).toThrow(
      "brush",
    );
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});
