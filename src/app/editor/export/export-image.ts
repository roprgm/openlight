import type { Gpu, Target } from "vgpu";
import { createEditorRenderer } from "@/app/editor/renderer";
import {
  completeFields,
  type EditorDocument,
  sceneFields,
  settledPixels,
} from "@/core/document";
import type { Point } from "@/core/image/frame";
import { renderBitmap } from "@/core/renderer";

const encodings = {
  png: { type: "image/png", extension: "png" },
  jpeg: { type: "image/jpeg", extension: "jpg" },
  webp: { type: "image/webp", extension: "webp" },
};

export type ExportFormat = keyof typeof encodings;

export type ExportOptions = {
  format?: ExportFormat;
  /** 1 to 100 for JPEG and WebP; PNG ignores it. */
  quality?: number;
  /** Longest output side in pixels, up to the document's. */
  longEdge?: number;
};

/** Whole-pixel output dimensions with the longest side scaled to `longEdge`. */
export function exportSize(
  [width, height]: Point,
  longEdge = Math.max(width, height),
): Point {
  const scale = longEdge / Math.max(width, height);
  return [
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  ];
}

/** Encodes a rendered image, downsampled to `longEdge` with high-quality smoothing. */
export async function encodeImage(
  gpu: Gpu,
  image: Target,
  { format = "png", quality = 80, longEdge }: ExportOptions = {},
) {
  if (!(format in encodings)) {
    throw new Error("Choose PNG, JPEG, or WebP.");
  }
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error("Quality must be between 1 and 100.");
  }
  const size = exportSize(image.size);
  const maxEdge = Math.max(...size);
  if (
    longEdge !== undefined &&
    (!Number.isInteger(longEdge) || longEdge < 1 || longEdge > maxEdge)
  ) {
    throw new Error(`Long edge must be between 1 and ${maxEdge} pixels.`);
  }
  const [width, height] = exportSize(size, longEdge);
  const bitmap = await renderBitmap(gpu, image, size);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Couldn't resize the image.");
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const encoding = encodings[format];
  const blob = await canvas.convertToBlob({
    type: encoding.type,
    quality: quality / 100,
  });
  if (blob.type !== encoding.type) {
    throw new Error(`This browser can't encode ${format.toUpperCase()}.`);
  }
  return blob;
}

/** The current edits rendered in full, which encodes any number of times until it is disposed. */
export type ExportRender = {
  output: Target;
  /** The source file's name without its extension. */
  name: string;
  dispose: () => void;
};

/**
 * Renders a snapshot of the current edits. Taken now, since another photo may close the document
 * meanwhile; its Remove fields complete after, read back from the editor when the document still waits.
 */
export async function renderExport(
  gpu: Gpu,
  document: EditorDocument,
): Promise<ExportRender> {
  const scene = document.scene.getState();
  const source = document.resources.get(scene.layers[0].source);
  const pixels = settledPixels(document, scene);
  const release = source.retain();
  let renderer: ReturnType<typeof createEditorRenderer> | undefined;
  try {
    const fields = await completeFields(document, sceneFields(document, scene));
    renderer = createEditorRenderer(gpu, source, {
      paintPixels: (id) => {
        const blob = pixels.get(id);
        if (!blob) {
          throw Error("Settled paint is unavailable.");
        }
        return blob;
      },
      field: (id) => fields.get(id),
    });
    await renderer.update(scene);
  } catch (error) {
    renderer?.dispose();
    release();
    throw error;
  }
  const rendered = renderer;
  return {
    output: rendered.outputImage(),
    name: source.file.name.replace(/\.[^.]*$/, "") || "export",
    dispose() {
      rendered.dispose();
      release();
    },
  };
}

/** Encodes a render as a file named after its source. */
export async function encodeExport(
  gpu: Gpu,
  { output, name }: ExportRender,
  options: ExportOptions = {},
) {
  const blob = await encodeImage(gpu, output, options);
  const { extension } = encodings[options.format ?? "png"];
  return new File([blob], `${name}.${extension}`, { type: blob.type });
}

/**
 * The current edits rendered in full while an export view is open. `refresh` renders them as they
 * are now in place of the last render, which goes first, so the session holds one; `encode` makes a
 * file from the latest render. Renders, encodes, and releases run one at a time in order, so nothing
 * reads an image after it goes, and a change during one waits for it. Listeners hear each refresh's
 * outcome: nothing, or why it failed.
 */
export function createExportSession(gpu: Gpu, document: EditorDocument) {
  let render: ExportRender | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(failure?: string) => void>();
  let disposed = false;
  function chain<T>(step: () => Promise<T>) {
    const result = queue.then(step);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  return {
    refresh: () =>
      chain(async () => {
        if (disposed) {
          return;
        }
        render?.dispose();
        render = undefined;
        let failure: string | undefined;
        try {
          const next = await renderExport(gpu, document);
          if (disposed) {
            next.dispose();
            return;
          }
          render = next;
        } catch (error) {
          failure = error instanceof Error ? error.message : "Couldn't render.";
        }
        for (const listener of listeners) {
          listener(failure);
        }
      }),
    encode: (options: ExportOptions) =>
      chain(() => {
        if (!render) {
          throw Error("The photo is still rendering.");
        }
        return encodeExport(gpu, render, options);
      }),
    subscribe(listener: (failure?: string) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      void chain(async () => {
        render?.dispose();
        render = undefined;
      });
    },
  };
}

/** Renders a snapshot of the current edits and encodes it, named after the source file. */
export async function exportImage(
  gpu: Gpu,
  document: EditorDocument,
  options: ExportOptions = {},
) {
  const render = await renderExport(gpu, document);
  try {
    return await encodeExport(gpu, render, options);
  } finally {
    render.dispose();
  }
}
