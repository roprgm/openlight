import { checkSize } from "./size";

const fallbackSize = 1024;

/** Rasterizes through an <img>, since SVGs without intrinsic size can't go straight to a bitmap. */
export async function decodeSvg(file: Blob) {
  const image = new Image();
  image.src = URL.createObjectURL(file);
  await image.decode();
  URL.revokeObjectURL(image.src);
  const width = image.naturalWidth || fallbackSize;
  const height = image.naturalHeight || fallbackSize;
  checkSize(width, height);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.transferToImageBitmap();
}
