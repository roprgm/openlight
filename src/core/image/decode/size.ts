/** The longest side OpenLight opens: WebGPU guarantees textures this large on every device. */
const maxImageSide = 8192;

const count = new Intl.NumberFormat("en-US");

/** Rejects an image larger than OpenLight opens. */
export function checkSize(width: number, height: number) {
  if (Math.max(width, height) <= maxImageSide) {
    return;
  }
  throw new Error(
    `OpenLight opens images up to ${count.format(maxImageSide)} pixels per side; this one is ${count.format(width)} × ${count.format(height)}.`,
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
export async function checkHeader(file: Blob) {
  const size = await declaredSize(file);
  if (size) {
    checkSize(size.width, size.height);
  }
}
