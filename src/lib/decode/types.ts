/** Raw interleaved rgba8, for decoders that don't go through the browser's image pipeline. */
export type Pixels = {
	width: number;
	height: number;
	data: Uint8ClampedArray<ArrayBuffer>;
};
export type Decoded = ImageBitmap | Pixels;
export type Decoder = (file: Blob) => Promise<Decoded>;
