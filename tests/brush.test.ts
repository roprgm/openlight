import { expect, mock, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { BrushStroke, StrokePoint } from "@/core/document";
import { createDocument, createResources, findLayer } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { type Dab, type DabWalk, walkDabs } from "@/core/renderer/strokes/dabs";
import { setAdjustments } from "@/features/adjustments/edits";
import {
  addLayer,
  deleteLayer,
  extendStroke,
  moveLayer,
  paintStroke,
  setLayer,
  setLayerMask,
  setMaskOperation,
} from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";

const stroke: BrushStroke = {
  mode: "paint",
  size: 8,
  feather: 0.5,
  flow: 0.5,
  points: [[10, 10, 1]],
};

test("dabs follow the stroke sixteen times per diameter with interpolated pressure, laying what one every quarter would", () => {
  const wide = { ...stroke, size: 32 };
  // Four dabs stand for one a quarter diameter apart, together leaving as much uncovered.
  const laid = (flow: number) => 1 - (1 - flow) ** (1 / 4);
  expect(walkDabs(wide).dabs).toEqual([[10, 10, 16, laid(0.5)]]);
  const line = walkDabs({
    ...wide,
    points: [
      [10, 10, 1],
      [20, 10, 0.5],
      [30, 10, 0],
    ],
  }).dabs;
  expect(line).toHaveLength(11);
  expect(line[0]).toEqual([10, 10, 16, laid(0.5)]);
  expect(line[5]).toEqual([20, 10, 16, laid(0.25)]);
  expect(line[10][0]).toBeCloseTo(30);
  expect(line[10][3]).toBeCloseTo(0);
  // Small brushes keep a dab per pixel, each laying a share to match.
  const small = walkDabs({
    ...stroke,
    points: [
      [10, 10, 1],
      [20, 10, 1],
    ],
  }).dabs;
  expect(small).toHaveLength(11);
  expect(small[0][3]).toBeCloseTo(1 - 0.5 ** 0.5);
  expect(walkDabs({ ...stroke, points: [] }).dabs).toEqual([]);
});

test("a walk goes on where it stopped as a stroke grows, landing the dabs a whole walk would", () => {
  const points: StrokePoint[] = [
    [10, 10, 1],
    [23, 14, 0.8],
    [31, 30, 0.4],
    [50, 31, 0.9],
    [52, 60, 0.2],
  ];
  const whole = walkDabs({ ...stroke, size: 20, points }).dabs;
  const walked: Dab[] = [];
  let walk: DabWalk | undefined;
  for (let end = 1; end <= points.length; end++) {
    const step = walkDabs(
      { ...stroke, size: 20, points: points.slice(0, end) },
      walk,
    );
    walked.push(...step.dabs);
    walk = step.walk;
  }
  expect(walked).toEqual(whole);
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
      // The open stroke waits in the stroke buffer, and the mask reads it laid over its raster in the view.
      rasters: [
        { id: mask, size: [32, 16], format: "r8unorm" },
        { id: "stroke view", size: [32, 16], format: "r8unorm" },
        { id: "stroke buffer", size: [32, 16], format: "r16float" },
      ],
    });
    expect(renderer.coverage(mask)?.target.size).toEqual([32, 16]);
    // A 20 px extension adds twenty dabs; earlier ones are not stamped again.
    extendStroke(document, mask, [[30, 10, 1]]);
    await render(true);
    expect(renderer.inspect().stamped).toBe(21);
    expect(renderer.outputImage().size).toEqual([64, 32]);
    // The display scale sets the proxy: a quarter of a device pixel per source pixel means a quarter-size render.
    renderer.setDisplayScale(0.25);
    await render(true);
    expect(renderer.outputImage().size).toEqual([16, 8]);
    expect(renderer.inspect().stamped).toBe(21);
    document.history.commit();
    expect(document.history.status.getState().editing).toBe(false);
    await render();
    expect(renderer.outputImage().size).toEqual([64, 32]);
    const rendered = notify.mock.calls.length;
    await render();
    expect(notify).toHaveBeenCalledTimes(rendered);
    paintStroke(document, mask, { ...stroke, mode: "erase" });
    await render();
    expect(renderer.inspect().stamped).toBe(22);
    // Undo removes the last stroke, which rebuilds the raster from the remaining one.
    document.history.undo();
    await render();
    expect(renderer.inspect().stamped).toBe(43);
    const layer = findLayer(document.scene.getState().layers, mask);
    expect(layer?.kind === "mask" && layer.mask.kind === "brush").toBe(true);
    if (layer?.kind === "mask" && layer.mask.kind === "brush") {
      expect(layer.mask.strokes).toHaveLength(1);
      expect(layer.mask.strokes[0].points).toHaveLength(2);
    }
    document.history.undo();
    await render();
    expect(renderer.coverage(mask)).toBeUndefined();
    expect(
      renderer.inspect().rasters.some((raster) => raster.id === mask),
    ).toBe(true);
    document.history.redo();
    await render();
    expect(renderer.coverage(mask)).toBeDefined();
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
    // The child keeps its own coverage for its preview; the graph folds it into the gradient's.
    expect(renderer.inspect().rasters.map((raster) => raster.id)).toEqual([
      mask,
      child,
      "stroke view",
      "stroke buffer",
    ]);
    expect(renderer.inspect().passes).toEqual(
      expect.arrayContaining([
        `mask/${gradient}/gradient`,
        `mask/${child}/combine`,
      ]),
    );
    expect(renderer.coverage(child)?.target.size).toEqual([32, 16]);
    expect(renderer.coverage(gradient)?.target.size).toEqual([32, 16]);
    setLayer(document, child, { visible: false });
    await render();
    expect(renderer.coverage(child)?.target.size).toEqual([32, 16]);
    expect(renderer.inspect().passes).not.toContain(`mask/${child}/combine`);
    setLayer(document, child, { visible: true, opacity: 0 });
    await render();
    expect(renderer.coverage(child)?.target.size).toEqual([32, 16]);
    setLayerMask(document, child, { kind: "brush", strokes: [] });
    await render();
    expect(renderer.coverage(child)).toBeUndefined();
    document.history.undo();
    setLayer(document, child, { opacity: 1 });
    // Hiding a group bypasses its effect, but preserves the combined coverage shown in its row.
    setLayer(document, gradient, { visible: false });
    await render();
    expect(renderer.coverage(gradient)?.target.size).toEqual([32, 16]);
    expect(renderer.inspect().passes).toContain(`mask/${child}/combine`);
    expect(renderer.inspect().passes).not.toContain(`layer/${gradient}/raster`);
    setLayer(document, gradient, { visible: true });
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

test("a brush yet to paint takes no part in its group", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [64, 32], format: "rgba16float" }),
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
  const renderer = createEditorRenderer(gpu, source);
  const passes = async () => {
    await renderer.update(document.scene.getState());
    return renderer.inspect().passes;
  };
  try {
    const brush = addLayer(
      document,
      createMask({ kind: "brush", strokes: [] }),
    );
    setAdjustments(document, { exposure: 1 }, brush);
    const gradient = addLayer(
      document,
      createMask(defaultGradient([64, 32]), "subtract"),
      { inside: brush },
    );
    // Taking away from nothing leaves nothing, so the mask is bypassed.
    expect(await passes()).toEqual([]);
    // Adding to it starts from nothing covered.
    setMaskOperation(document, gradient, "add");
    expect(await passes()).toEqual(
      expect.arrayContaining([
        `mask/${brush}/empty`,
        `mask/${gradient}/combine`,
        `layer/${brush}/raster`,
      ]),
    );
    // Intersecting a gradient, it leaves the gradient whole until it paints.
    const shaped = addLayer(document, createMask(defaultGradient([64, 32])));
    setAdjustments(document, { exposure: 1 }, shaped);
    const child = addLayer(
      document,
      createMask({ kind: "brush", strokes: [] }, "intersect"),
      { inside: shaped },
    );
    expect(await passes()).toContain(`layer/${shaped}/mix`);
    paintStroke(document, child, stroke);
    expect(await passes()).toEqual(
      expect.arrayContaining([
        `mask/${shaped}/gradient`,
        `mask/${child}/combine`,
        `layer/${shaped}/raster`,
      ]),
    );
    const effect = addLayer(document, createLayer("exposure"));
    moveLayer(document, child, 0, effect);
    setLayer(document, effect, { visible: false });
    await passes();
    expect(renderer.coverage(child)?.target.size).toEqual([32, 16]);
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});
