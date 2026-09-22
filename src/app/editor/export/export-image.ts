import type { Gpu, Target } from "vgpu";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { EditorDocument } from "@/core/document";
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

/** Renders a snapshot of the current edits, named after the source file. */
export async function exportImage(
  gpu: Gpu,
  document: EditorDocument,
  options: ExportOptions = {},
) {
  const scene = document.scene.getState();
  const source = document.resources.get(scene.layers[0].source);
  const renderer = createEditorRenderer(gpu, source);
  try {
    await renderer.update(scene);
    // The renderer retains the source until encoding finishes.
    const blob = await encodeImage(gpu, renderer.outputImage(), options);
    const name = source.file.name.replace(/\.[^.]*$/, "") || "export";
    const { extension } = encodings[options.format ?? "png"];
    return new File([blob], `${name}.${extension}`, { type: blob.type });
  } finally {
    renderer.dispose();
  }
}
