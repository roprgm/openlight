/** TIFF and BigTIFF directories: every tag of every image, and the layout the decoder needs. */

export type Tag = { type: number; count: number; at: number };
export type Directory = { tags: Map<number, Tag>; subdirectories: Directory[] };

export type Tiff = {
	littleEndian: boolean;
	/** Image directories in file order, each with its SubIFDs. */
	directories: Directory[];
	/** A tag's values by type: numbers, rationals divided, or text for ASCII. */
	value(directory: Directory, tag: number): number[] | string | undefined;
	/** A BYTE or UNDEFINED tag's bytes, copied. */
	bytes(directory: Directory, tag: number): Uint8Array | undefined;
};

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
	5: 8,
	6: 1,
	7: 1,
	8: 2,
	9: 4,
	10: 8,
	11: 4,
	12: 8,
	16: 8,
	17: 8,
	18: 8,
};

export function readTiff(buffer: ArrayBuffer): Tiff {
	const view = new DataView(buffer);
	const littleEndian = view.getUint16(0, true) === 0x4949;
	const magic = buffer.byteLength < 8 ? 0 : view.getUint16(2, littleEndian);
	const big = magic === 43;
	if (magic !== 42 && !big) {
		throw new Error("Not a TIFF file.");
	}
	const offsetSize = big ? 8 : 4;
	const unsigned = (at: number, size: number) =>
		size === 8
			? Number(view.getBigUint64(at, littleEndian))
			: size === 4
				? view.getUint32(at, littleEndian)
				: size === 2
					? view.getUint16(at, littleEndian)
					: view.getUint8(at);
	const signed = (at: number, size: number) =>
		size === 8
			? Number(view.getBigInt64(at, littleEndian))
			: size === 4
				? view.getInt32(at, littleEndian)
				: size === 2
					? view.getInt16(at, littleEndian)
					: view.getInt8(at);
	function number({ type, at }: Tag, i: number) {
		const size = sizes[type];
		const p = at + i * size;
		switch (type) {
			case 5:
				return unsigned(p, 4) / unsigned(p + 4, 4);
			case 10:
				return signed(p, 4) / signed(p + 4, 4);
			case 11:
				return view.getFloat32(p, littleEndian);
			case 12:
				return view.getFloat64(p, littleEndian);
			case 6:
			case 8:
			case 9:
			case 17:
				return signed(p, size);
			default:
				return unsigned(p, size);
		}
	}
	const numbers = (tag: Tag) =>
		Array.from({ length: tag.count }, (_, i) => number(tag, i));
	function directory(at: number, depth: number): Directory {
		const count = unsigned(at, big ? 8 : 2);
		const tags = new Map<number, Tag>();
		for (let i = 0; i < count; i++) {
			const entry = at + (big ? 8 : 2) + i * (big ? 20 : 12);
			const type = unsigned(entry + 2, 2);
			const length = unsigned(entry + 4, offsetSize);
			const inline = (sizes[type] ?? 1) * length <= offsetSize;
			tags.set(unsigned(entry, 2), {
				type,
				count: length,
				at: inline
					? entry + 4 + offsetSize
					: unsigned(entry + 4 + offsetSize, offsetSize),
			});
		}
		const subdirectories = tags.get(330);
		return {
			tags,
			subdirectories:
				subdirectories && depth < 4
					? numbers(subdirectories).map((offset) =>
							directory(offset, depth + 1),
						)
					: [],
		};
	}
	const directories: Directory[] = [];
	for (
		let at = unsigned(big ? 8 : 4, offsetSize);
		at > 0 && at < buffer.byteLength && directories.length < 64;
	) {
		const count = unsigned(at, big ? 8 : 2);
		directories.push(directory(at, 0));
		at = unsigned(at + (big ? 8 : 2) + count * (big ? 20 : 12), offsetSize);
	}
	return {
		littleEndian,
		directories,
		value(directory, tag) {
			const found = directory.tags.get(tag);
			if (!found) {
				return;
			}
			return found.type === 2
				? new TextDecoder().decode(
						new Uint8Array(buffer, found.at, Math.max(0, found.count - 1)),
					)
				: numbers(found);
		},
		bytes(directory, tag) {
			const found = directory.tags.get(tag);
			return (
				found &&
				new Uint8Array(
					buffer.slice(
						found.at,
						found.at + found.count * (sizes[found.type] ?? 1),
					),
				)
			);
		},
	};
}

/** Layout of one image, the first by default. */
export function parseTiff(
	buffer: ArrayBuffer,
	directory?: Directory,
): TiffInfo {
	const tiff = readTiff(buffer);
	const image = directory ?? tiff.directories[0];
	const list = (tag: number) => {
		const value = tiff.value(image, tag);
		return typeof value === "string" ? [] : (value ?? []);
	};
	const one = (tag: number, fallback: number) => list(tag)[0] ?? fallback;
	const width = one(256, 0);
	const height = one(257, 0);
	const tiled = image.tags.has(324);
	const offsets = list(tiled ? 324 : 273);
	const counts = list(tiled ? 325 : 279);
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
	const colorMap = list(320);
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
		littleEndian: tiff.littleEndian,
		premultiplied: one(338, 0) === 1,
		colorMap: colorMap.length ? Uint16Array.from(colorMap) : undefined,
		icc: tiff.bytes(image, 34675),
		chunks,
		across,
		chunkHeight,
	};
}
