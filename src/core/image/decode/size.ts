import type { Gpu } from "vgpu";

const count = new Intl.NumberFormat("en-US");

/** Rejects an image larger than the device's textures hold. */
export function checkSize(gpu: Gpu, width: number, height: number) {
  const limit = gpu.gpu.limits.maxTextureDimension2D;
  if (Math.max(width, height) <= limit) {
    return;
  }
  throw new Error(
    `This device opens images up to ${count.format(limit)} pixels per side; this one is ${count.format(width)} × ${count.format(height)}.`,
  );
}

/** The size the header declares; a header it can't read is the decoder's to report. */
async function declaredSize(file: Blob) {
  const { imageSize } = await import("image-size");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return imageSize(bytes);
  } catch {
    return undefined;
  }
}

/** Checks the size its header declares, without decoding a pixel. */
export async function checkHeader(gpu: Gpu, file: Blob) {
  const size = await declaredSize(file);
  if (size) {
    checkSize(gpu, size.width, size.height);
  }
}
