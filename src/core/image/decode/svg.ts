const fallbackSize = 1024;

/** Rasterizes through an <img>, since SVGs without intrinsic size can't go straight to a bitmap. */
export default async function decodeSvg(file: Blob) {
	const image = new Image();
	image.src = URL.createObjectURL(file);
	await image.decode();
	URL.revokeObjectURL(image.src);
	const canvas = new OffscreenCanvas(
		image.naturalWidth || fallbackSize,
		image.naturalHeight || fallbackSize,
	);
	canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
	return canvas.transferToImageBitmap();
}
