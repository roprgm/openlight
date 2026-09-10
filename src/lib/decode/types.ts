/** Raw interleaved rgba8, for decoders that don't go through the browser's image pipeline. */
export type Pixels = {
	width: number;
	height: number;
	data: Uint8ClampedArray<ArrayBuffer>;
};
/** Video frames tiled on a grid `columns` wide, cropped to width × height, then rotated counter-clockwise by `rotation` quarter turns. */
export type Frames = {
	width: number;
	height: number;
	tiles: VideoFrame[];
	columns: number;
	rotation: number;
};
export type Decoded = ImageBitmap | Pixels | Frames;
export type Decoder = (file: Blob) => Promise<Decoded>;
