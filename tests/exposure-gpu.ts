import { frame, init, target } from "vgpu";
import { createImageLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { addLayer } from "@/features/layers/edits";

/** Reads working pixels before display clipping, including those a later mask can recover. */
export async function recoverExposure() {
  const gpu = await init();
  const image = target(gpu, {
    size: [16, 16],
    format: "rgba16float",
    clearColor: [0.25, 0.5, 0.75, 0.75],
  });
  frame(gpu, (frame) => frame.pass({ target: image, clear: true }, () => {}));
  const source = createImageSource(image);
  const resources = createResources();
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(image.size),
      layers: [createImageLayer(sourceId, "Photo")],
    },
    resources,
  );
  const renderer = createEditorRenderer(gpu, source);
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  async function samples() {
    await renderer.update(document.scene.getState());
    const image = renderer.fullImage();
    const pixels = await image.readFloats();
    return [1, 8, 14].map((y) => [
      ...pixels.slice((y * 16 + 8) * 4, (y * 16 + 8) * 4 + 4),
    ]);
  }
  try {
    const original = await samples();
    setAdjustments(document, { exposure: 3 });
    const exposed = await samples();
    const mask = addLayer(
      document,
      createMask({ kind: "linear", start: [0, 4], end: [0, 12] }),
    );
    setAdjustments(document, { exposure: -3 }, mask);
    const recovered = await samples();
    return { original, exposed, recovered, errors };
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
}
