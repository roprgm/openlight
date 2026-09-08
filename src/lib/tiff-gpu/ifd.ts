/** TIFF and BigTIFF directory reader: geometry, layout, and the tags the decoder needs. */

export type Chunk = {
	offset: number;
	length: number;
	x: number;
	y: number;
	width: number;
	height: number;
};

export type TiffInfo = {
	width: number;
	height: number;
	samplesPerPixel: number;
	bitsPerSample: number;
	sampleFormat: number;
	photometric: number;
	compression: number;
	predictor: number;
	planar: number;
	orientation: number;
	littleEndian: boolean;
	premultiplied: boolean;
	colorMap?: Uint16Array;
	icc?: Uint8Array;
	/** Strips or tiles in plane, row, column order; `across` chunks per row, `chunkHeight` rows each. */
	chunks: Chunk[];
	across: number;
	chunkHeight: number;
};

const sizes: Record<number, number> = {
	1: 1,
	2: 1,
	3: 2,
	4: 4,
	6: 1,
	7: 1,
	8: 2,
	9: 4,
	16: 8,
	17: 8,
	18: 8,
};
const needed = new Set([
	256, 257, 258, 259, 262, 273, 274, 277, 278, 279, 284, 317, 320, 322, 323,
	324, 325, 338, 339,
]);

export function parseTiff(buffer: ArrayBuffer): TiffInfo {
	const view = new DataView(buffer);
	const littleEndian = view.getUint16(0, true) === 0x4949;
	const magic = buffer.byteLength < 8 ? 0 : view.getUint16(2, littleEndian);
	const big = magic === 43;
	if (magic !== 42 && !big) {
		throw new Error("Not a TIFF file.");
	}
	const read = (at: number, size: number) =>
		size === 8
			? Number(view.getBigUint64(at, littleEndian))
			: size === 4
				? view.getUint32(at, littleEndian)
				: size === 2
					? view.getUint16(at, littleEndian)
					: view.getUint8(at);
	const offsetSize = big ? 8 : 4;
	const directory = read(big ? 8 : 4, offsetSize);
	const count = read(directory, big ? 8 : 2);
	const tags = new Map<number, number[]>();
	let icc: Uint8Array | undefined;
	for (let i = 0; i < count; i++) {
		const entry = directory + (big ? 8 : 2) + i * (big ? 20 : 12);
		const tag = read(entry, 2);
		const size = sizes[read(entry + 2, 2)] ?? 1;
		const length = read(entry + 4, offsetSize);
		const inline = size * length <= offsetSize;
		const at = inline
			? entry + 4 + offsetSize
			: read(entry + 4 + offsetSize, offsetSize);
		if (tag === 34675) {
			icc = new Uint8Array(buffer.slice(at, at + length));
		} else if (needed.has(tag)) {
			tags.set(
				tag,
				Array.from({ length }, (_, k) => read(at + k * size, size)),
			);
		}
	}
	const one = (tag: number, fallback: number) => tags.get(tag)?.[0] ?? fallback;
	const width = one(256, 0);
	const height = one(257, 0);
	const tiled = tags.has(324);
	const offsets = tags.get(tiled ? 324 : 273) ?? [];
	const counts = tags.get(tiled ? 325 : 279) ?? [];
	const chunkWidth = tiled ? one(322, 0) : width;
	const chunkHeight = tiled ? one(323, 0) : Math.min(one(278, height), height);
	if (
		width < 1 ||
		height < 1 ||
		chunkWidth < 1 ||
		chunkHeight < 1 ||
		!offsets.length
	) {
		throw new Error("TIFF has no image data.");
	}
	const across = Math.ceil(width / chunkWidth);
	const chunksPerPlane = across * Math.ceil(height / chunkHeight);
	const chunks = offsets.map((offset, i) => {
		const length = counts[i] ?? 0;
		if (offset + length > buffer.byteLength) {
			throw new Error("Truncated TIFF file.");
		}
		const j = i % chunksPerPlane;
		const y = Math.floor(j / across) * chunkHeight;
		return {
			offset,
			length,
			x: (j % across) * chunkWidth,
			y,
			width: chunkWidth,
			height: tiled ? chunkHeight : Math.min(chunkHeight, height - y),
		};
	});
	const colorMap = tags.get(320);
	return {
		width,
		height,
		samplesPerPixel: one(277, 1),
		bitsPerSample: one(258, 1),
		sampleFormat: one(339, 1),
		photometric: one(262, 1),
		compression: one(259, 1),
		predictor: one(317, 1),
		planar: one(284, 1),
		orientation: one(274, 1),
		littleEndian,
		premultiplied: one(338, 0) === 1,
		colorMap: colorMap && Uint16Array.from(colorMap),
		icc,
		chunks,
		across,
		chunkHeight,
	};
}
