import { imageColor } from "./color";
import { decompress } from "./compression";
import type { Raster } from "./raster";

export function check(value: unknown, message: string): asserts value {
	if (!value) {
		throw new Error(message);
	}
}

/** A bounded TIFF directory; numeric values keep their file representation until interpreted. */
export class Directory {
	constructor(
		readonly tags: Map<number, number[]>,
		readonly file: Tiff,
		readonly offsets = new Map<number, number>(),
	) {}
	get(tag: number, fallback: number[] = []) {
		return this.tags.get(tag) ?? fallback;
	}
	one(tag: number, fallback = 0) {
		return this.get(tag)[0] ?? fallback;
	}
}

/** Bounded classic TIFF directory traversal. */
export class Tiff {
	readonly view: DataView;
	readonly little: boolean;
	readonly directories: Directory[] = [];
	constructor(readonly bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		check(bytes.length >= 8, "Truncated TIFF header.");
		this.little = bytes[0] === 73 && bytes[1] === 73;
		check(
			this.little || (bytes[0] === 77 && bytes[1] === 77),
			"Invalid TIFF byte order.",
		);
		check(this.uint(2, 2) !== 43, "BigTIFF is not supported yet.");
		check(this.uint(2, 2) === 42, "Invalid TIFF signature.");
		const pending = [this.uint(4)];
		const seen = new Set<number>();
		while (pending.length) {
			const at = pending.shift() ?? 0;
			if (!at) {
				continue;
			}
			check(
				!seen.has(at) && seen.size < 128,
				"Invalid or excessive TIFF directories.",
			);
			seen.add(at);
			const { directory, next } = this.directory(at);
			this.directories.push(directory);
			pending.push(...directory.get(330), next);
		}
	}
	slice(at: number, size: number) {
		check(
			Number.isSafeInteger(at) &&
				Number.isSafeInteger(size) &&
				at >= 0 &&
				size >= 0 &&
				at <= this.bytes.length - size,
			"TIFF offset is outside the file.",
		);
		return this.bytes.subarray(at, at + size);
	}
	uint(at: number, size = 4) {
		this.slice(at, size);
		return size === 2
			? this.view.getUint16(at, this.little)
			: this.view.getUint32(at, this.little);
	}
	directory(at: number) {
		const count = this.uint(at, 2);
		check(count <= 4096, "Excessive TIFF tags.");
		this.slice(at + 2, count * 12 + 4);
		const tags = new Map<number, number[]>();
		const offsets = new Map<number, number>();
		const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
		for (let i = 0; i < count; i++) {
			const entry = at + 2 + i * 12;
			const tag = this.uint(entry, 2),
				type = this.uint(entry + 2, 2),
				length = this.uint(entry + 4);
			const size = sizes[type];
			if (!size) {
				continue;
			}
			check(length <= 1_000_000, "Excessive TIFF tag values.");
			const start = length * size <= 4 ? entry + 8 : this.uint(entry + 8);
			this.slice(start, length * size);
			const values = Array.from({ length }, (_, j) => {
				const p = start + j * size,
					v = this.view,
					le = this.little;
				switch (type) {
					case 1:
					case 2:
					case 7:
						return v.getUint8(p);
					case 6:
						return v.getInt8(p);
					case 3:
						return v.getUint16(p, le);
					case 8:
						return v.getInt16(p, le);
					case 4:
					case 13:
						return v.getUint32(p, le);
					case 9:
						return v.getInt32(p, le);
					case 5:
						return v.getUint32(p, le) / v.getUint32(p + 4, le);
					case 10:
						return v.getInt32(p, le) / v.getInt32(p + 4, le);
					case 11:
						return v.getFloat32(p, le);
					default:
						return v.getFloat64(p, le);
				}
			});
			check(
				values.every(Number.isFinite) && !tags.has(tag),
				"Invalid or repeated TIFF tag.",
			);
			tags.set(tag, values);
			offsets.set(tag, start);
		}
		return {
			directory: new Directory(tags, this, offsets),
			next: this.uint(at + 2 + count * 12),
		};
	}
}

export async function decodeTiff(bytes: Uint8Array): Promise<Raster> {
	const file = new Tiff(bytes);
	const root = file.directories[0];
	check(root, "TIFF has no image directory.");
	check(!root.tags.has(50706), "DNG requires a Camera RAW loader.");
	const image = file.directories.find(
		(d) => d.one(256) && d.one(257) && !(d.one(254) & 5),
	);
	check(image, "TIFF has no full-resolution image.");
	const width = image.one(256),
		height = image.one(257),
		channels = image.one(277, 1);
	check(
		[width, height, channels].every(Number.isSafeInteger) &&
			width > 0 &&
			height > 0 &&
			channels > 0 &&
			width * height * channels <= 256_000_000,
		"Image exceeds the import size limit.",
	);
	const bits = image.one(258, 8),
		format = image.one(339, 1),
		photo = image.one(262);
	check(
		[1, 3].includes(format) &&
			(format === 3 ? [16, 32] : [8, 12, 14, 16, 32]).includes(bits),
		"Unsupported TIFF sample type or bit depth.",
	);
	check(
		image.get(258, [bits]).every((v) => v === bits) &&
			image.get(339, [format]).every((v) => v === format),
		"Mixed TIFF sample types are unsupported.",
	);
	check(
		[0, 1, 2].includes(photo) &&
			channels >= (photo === 2 ? 3 : 1) &&
			channels <= (photo === 2 ? 4 : 2),
		"Unsupported TIFF color model.",
	);
	const alpha = image.one(338),
		orientation = image.one(274, root.one(274, 1));
	check(
		Number.isInteger(orientation) && orientation >= 1 && orientation <= 8,
		"Invalid TIFF orientation.",
	);
	check(
		channels === (photo === 2 ? 3 : 1) || alpha === 1 || alpha === 2,
		"TIFF extra channel is not a supported alpha channel.",
	);
	const planar = image.one(284, 1),
		compression = image.one(259, 1),
		predictor = image.one(317, 1);
	check(planar === 1 || planar === 2, "Invalid TIFF planar layout.");
	check(
		[1, 2, 3].includes(predictor) &&
			(predictor !== 3 || format === 3) &&
			(predictor !== 2 || format === 1),
		"Unsupported TIFF predictor.",
	);
	check(image.one(266, 1) === 1, "Reversed TIFF bit order is unsupported.");
	const tiled = image.tags.has(324);
	const tileWidth = tiled ? image.one(322) : width,
		tileHeight = tiled ? image.one(323) : image.one(278, height);
	check(
		Number.isInteger(tileWidth) &&
			Number.isInteger(tileHeight) &&
			tileWidth > 0 &&
			tileHeight > 0 &&
			tileWidth <= 65536 &&
			tileHeight <= 0xffffffff,
		"Invalid TIFF chunk dimensions.",
	);
	const columns = Math.ceil(width / tileWidth),
		rows = Math.ceil(height / tileHeight);
	const planes = planar === 2 ? channels : 1,
		samples = planar === 2 ? 1 : channels;
	const offsets = image.get(tiled ? 324 : 273),
		lengths = image.get(tiled ? 325 : 279);
	check(
		offsets.length === columns * rows * planes &&
			offsets.length === lengths.length &&
			offsets.length <= 65536,
		"Invalid TIFF chunk table.",
	);
	const color = imageColor(image);
	check(
		color.matrix.every((v) => Number.isFinite(Math.fround(v))),
		"Color calibration exceeds GPU precision.",
	);
	const chunks: Raster["chunks"] = [];
	for (let i = 0; i < offsets.length; i++) {
		const tile = i % (columns * rows),
			x = (tile % columns) * tileWidth,
			y = Math.floor(tile / columns) * tileHeight;
		const h = tiled ? tileHeight : Math.min(tileHeight, height - y);
		const rowBytes = Math.ceil((tileWidth * samples * bits) / 8);
		const expected = rowBytes * h;
		check(expected <= 512_000_000, "TIFF chunk exceeds the import size limit.");
		const data = await decompress(
			file.slice(offsets[i], lengths[i]),
			compression,
			expected,
		);
		// Small row batches bound GPU storage bindings; prediction always restarts at a row.
		for (let row = 0; row < Math.min(h, height - y); row += 128) {
			const count = Math.min(128, h - row, height - y - row);
			chunks.push({
				data: data.subarray(row * rowBytes, (row + count) * rowBytes),
				x,
				y: y + row,
				width: tileWidth,
				height: count,
				plane: planar === 2 ? Math.floor(i / (columns * rows)) : 0,
				samples,
				rowBytes,
			});
		}
	}
	return {
		width,
		height,
		channels,
		bits,
		format,
		predictor,
		little: Number(file.little),
		orientation,
		photo,
		alpha,
		chunks,
		...color,
	};
}
