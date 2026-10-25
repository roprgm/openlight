const count = new Intl.NumberFormat("en-US");

/** Rejects an image with a side longer than `limit`, the device's largest texture. */
export function checkSize(limit: number, width: number, height: number) {
  if (Math.max(width, height) <= limit) {
    return;
  }
  throw new Error(
    `This device opens images up to ${count.format(limit)} pixels per side; this one is ${count.format(width)} × ${count.format(height)}.`,
  );
}

/** Checks the size declared in the first 512 KiB; a header it can't read is left to the decoder. */
export async function checkHeader(limit: number, file: Blob) {
  const { imageSize } = await import("image-size");
  const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  let size: { width: number; height: number };
  try {
    size = imageSize(bytes);
  } catch {
    return;
  }
  checkSize(limit, size.width, size.height);
}
