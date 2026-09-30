import { frame, init, target } from "vgpu";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument, createResources, paintingOf } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { addLayer, paintStroke } from "@/features/layers/edits";
import { addPaintStroke } from "@/features/paint/edits";
import { settlePaint } from "@/features/paint/settle";

/** Holds actual GPU readback while the document changes, as another stroke or undo can do. */
export async function editDuringSettle(
  mode: "paint" | "mask",
  action: "append" | "undo" | "close",
) {
  const gpu = await init();
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  gpu.gpu.addEventListener("uncapturederror", (event) =>
    errors.push(event.error.message),
  );
  const height = action === "close" ? 1200 : 64;
  const source = createImageSource(
    target(gpu, {
      size: [64, height],
      format: "rgba16float",
      clearColor: [0.2, 0.2, 0.2, 1],
    }),
  );
  frame(gpu, (frame) =>
    frame.pass({ target: source.image, clear: true }, () => {}),
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
  const renderer = createEditorRenderer(gpu, source, {
    paintPixels: resources.paint,
  });
  const reference = createEditorRenderer(gpu, source, {
    paintPixels: resources.paint,
  });
  let pending = Promise.resolve();
  const detach = document.scene.subscribe((scene) => {
    pending = renderer.update(scene);
  });
  let release = () => {};
  let started = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const createBuffer = gpu.device.createBuffer.bind(gpu.device);
  try {
    const id = addLayer(
      document,
      mode === "paint"
        ? createLayer("paint")
        : createMask({ kind: "brush", strokes: [] }),
    );
    if (mode === "mask") setAdjustments(document, { exposure: 1 }, id);
    const stroke = {
      mode: "paint" as const,
      size: 8,
      feather: 0.5,
      flow: 0.01,
      points: [[32, height / 2, 1] as const],
    };
    const paint = () =>
      mode === "paint"
        ? addPaintStroke(document, id, { ...stroke, color: "#ff0000" })
        : paintStroke(document, id, stroke);
    for (let i = 0; i < 100; i++) paint();
    await pending;
    // The next buffer is readRaster's mapped buffer. Keep it mapped until the edit queued its render.
    gpu.device.createBuffer = (descriptor) => {
      const buffer = createBuffer(descriptor);
      const map = buffer.gpu.mapAsync.bind(buffer.gpu);
      buffer.gpu.mapAsync = async (...args) => {
        await map(...args);
        started();
        await gate;
      };
      return buffer;
    };
    const settling = settlePaint(document, renderer, id);
    await reading;
    gpu.device.createBuffer = createBuffer;
    if (action === "append") paint();
    if (action === "undo") document.history.undo();
    if (action === "close") {
      pending = renderer.update(document.scene.getState());
      document.dispose();
      renderer.dispose();
    }
    const before = document.scene.getState();
    const undoCount = document.history.status.getState().undoCount;
    release();
    const accepted = await settling;
    await pending;
    await gpu.gpu.queue.onSubmittedWorkDone();
    await gpu.settled();
    const scene = document.scene.getState();
    let error: number | undefined;
    if (action !== "close") {
      await renderer.update(scene);
      await reference.update(before);
      const actual = await renderer.fullImage().readFloats();
      const expected = await reference.fullImage().readFloats();
      error = actual.reduce(
        (max, value, index) => Math.max(max, Math.abs(value - expected[index])),
        0,
      );
    }
    const layer = scene.layers.find((layer) => layer.id === id);
    const painting = layer && paintingOf(layer);
    return {
      accepted,
      strokes: painting?.strokes.length,
      raster: painting?.raster,
      stamped: renderer.inspect().stamped,
      unchanged: scene === before,
      historyUnchanged:
        document.history.status.getState().undoCount === undoCount,
      error,
      errors,
    };
  } finally {
    release();
    gpu.device.createBuffer = createBuffer;
    detach();
    reference.dispose();
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
}
