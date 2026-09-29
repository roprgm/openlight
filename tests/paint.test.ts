import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import {
  createImageLayer,
  createLayer,
  createMask,
  maskNeutral,
} from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import {
  type Blend,
  createDocument,
  createResources,
  type PaintStroke,
  updateLayer,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import {
  addLayer,
  brushLimits,
  deleteLayer,
  duplicateLayer,
  setLayer,
} from "@/features/layers/edits";
import {
  addPaintStroke,
  extendPaintStroke,
  setPaintBlend,
} from "@/features/paint/edits";

const stroke: PaintStroke = {
  mode: "paint",
  size: 8,
  feather: 0.5,
  flow: 1,
  color: "#FF8000",
  points: [[600, 500, 1]],
};

async function open() {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [1024, 768], format: "rgba16float" }),
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
  return { gpu, source, document };
}

test("a paint layer stamps colored strokes into one raster the size of the photo, kept until the layer goes", async () => {
  const { gpu, source, document } = await open();
  const renderer = createEditorRenderer(gpu, source);
  const render = () => renderer.update(document.scene.getState());
  try {
    const paint = addLayer(document, createLayer("paint"));
    await render();
    // A layer without paint is bypassed and holds no raster.
    expect(renderer.inspect()).toMatchObject({ passes: [], rasters: [] });
    document.history.begin();
    addPaintStroke(document, paint, stroke);
    extendPaintStroke(document, paint, [[640, 500, 1]]);
    document.history.commit();
    await render();
    expect(renderer.inspect()).toMatchObject({
      passes: [`layer/${paint}/paint`],
      stamped: 1 + 20,
      rasters: [{ id: paint, size: [1024, 768], format: "rgba8unorm" }],
    });
    const scene = document.scene.getState();
    const layer = scene.layers[1];
    expect(layer.kind === "paint" && layer.strokes[0].color).toBe("#ff8000");
    setPaintBlend(document, paint, "multiply");
    expect(() => setPaintBlend(document, paint, "dissolve" as Blend)).toThrow(
      "Invalid blend",
    );
    expect(() =>
      addPaintStroke(document, paint, { ...stroke, color: "orange" }),
    ).toThrow("Invalid stroke");
    // Hiding keeps the raster, so showing the layer again stamps nothing.
    setLayer(document, paint, { visible: false });
    await render();
    expect(renderer.inspect()).toMatchObject({ passes: [], stamped: 21 });
    expect(renderer.inspect().rasters).toHaveLength(1);
    // Undoing every stroke clears the raster rather than freeing it, and painting again reuses it.
    const raster = renderer.coverage(paint);
    document.history.undo();
    document.history.undo();
    document.history.undo();
    await render();
    expect(renderer.inspect()).toMatchObject({ passes: [] });
    expect(renderer.coverage(paint)).toBe(raster);
    addPaintStroke(document, paint, stroke);
    await render();
    expect(renderer.inspect().passes).toEqual([`layer/${paint}/paint`]);
    expect(renderer.coverage(paint)).toBe(raster);
    // Deleting the layer frees it.
    deleteLayer(document, paint);
    await render();
    expect(renderer.inspect().rasters).toEqual([]);
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});

test("a photo holds up to 4 paint layers and, apart, 10 brush masks", async () => {
  const { gpu, document } = await open();
  try {
    const paint = addLayer(document, createLayer("paint"));
    for (let i = 1; i < brushLimits.color; i++) {
      addLayer(document, createLayer("paint"));
    }
    const full = document.scene.getState();
    expect(() => addLayer(document, createLayer("paint"))).toThrow(
      "up to 4 paint layers",
    );
    expect(() => duplicateLayer(document, paint)).toThrow("paint layers");
    expect(document.scene.getState()).toBe(full);
    for (let i = 0; i < brushLimits.mask; i++) {
      addLayer(document, createMask({ kind: "brush", strokes: [] }));
    }
    expect(() =>
      addLayer(document, createMask({ kind: "brush", strokes: [] })),
    ).toThrow("up to 10 brush masks");
    // Other layers still fit.
    addLayer(document, createLayer("exposure"));
  } finally {
    document.dispose();
    gpu.dispose();
  }
});

test("settled paint stays while the history names it and goes after", async () => {
  const { gpu, document } = await open();
  try {
    const paint = addLayer(document, createLayer("paint"));
    addPaintStroke(document, paint, stroke);
    const settle = (pixels: string) => {
      const raster = document.resources.addPaint(new Blob([pixels]));
      document.replace(
        updateLayer(document.scene.getState(), paint, (layer) => ({
          ...layer,
          raster,
          strokes: [],
        })),
      );
      return raster;
    };
    const first = settle("first");
    const undoCount = document.history.status.getState().undoCount;
    // Settling shows nothing new, so it records no step.
    expect(undoCount).toBe(2);
    addPaintStroke(document, paint, stroke);
    const second = settle("second");
    // The stroke's step names the first pixels, so they stay; nothing names them once it goes.
    expect(await document.resources.paint(first).text()).toBe("first");
    document.history.undo();
    expect(document.scene.getState().layers[1]).toMatchObject({
      raster: first,
      strokes: [],
    });
    document.history.clear();
    setLayer(document, paint, { name: "Glow" });
    expect(() => document.resources.paint(second)).toThrow("unavailable");
    expect(await document.resources.paint(first).text()).toBe("first");
    // Deleting the layer keeps them for undo, until that step goes too.
    deleteLayer(document, paint);
    expect(await document.resources.paint(first).text()).toBe("first");
    document.history.clear();
    expect(() => document.resources.paint(first)).toThrow("unavailable");
  } finally {
    document.dispose();
    gpu.dispose();
  }
});

test("a paint layer changes a mask once it holds paint, settled or not", () => {
  const mask = createMask({ kind: "brush", strokes: [] });
  const paint = createLayer("paint");
  expect(maskNeutral({ ...mask, children: [paint] })).toBe(true);
  expect(
    maskNeutral({ ...mask, children: [{ ...paint, strokes: [stroke] }] }),
  ).toBe(false);
  expect(
    maskNeutral({ ...mask, children: [{ ...paint, raster: "settled" }] }),
  ).toBe(false);
});
