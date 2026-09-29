import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import {
  type Blend,
  createDocument,
  createResources,
  type PaintStroke,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import {
  addLayer,
  duplicateLayer,
  maxBrushLayers,
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

test("paint layers stamp colored strokes into a bounded raster and blend them over the image", async () => {
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
      rasters: [{ id: paint, size: [256, 256], format: "rgba8unorm" }],
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
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});

test(`a photo holds up to ${maxBrushLayers} paint layers and brush masks`, async () => {
  const { gpu, document } = await open();
  try {
    const paint = addLayer(document, createLayer("paint"));
    for (let i = 1; i < maxBrushLayers; i++) {
      addLayer(document, createMask({ kind: "brush", strokes: [] }));
    }
    const full = document.scene.getState();
    expect(() =>
      addLayer(document, createMask({ kind: "brush", strokes: [] })),
    ).toThrow(`up to ${maxBrushLayers} brush layers`);
    expect(() => duplicateLayer(document, paint)).toThrow("brush layers");
    expect(document.scene.getState()).toBe(full);
    // Other layers still fit.
    addLayer(document, createLayer("exposure"));
  } finally {
    document.dispose();
    gpu.dispose();
  }
});
