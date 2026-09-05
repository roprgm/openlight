/**
 * HEIC through the browser's HEVC decoder (WebCodecs). Reads just enough HEIF to find the primary
 * image, one hvc1 item or a grid of hvc1 tiles. Parsing is independent of WebCodecs.
 */

type Box = { type: string; start: number; end: number };

function check(condition: unknown): asserts condition {
	if (!condition) {
		throw new Error("HEIF: invalid or unsupported image");
	}
}

class Reader {
	at = 0;
	end: number;

	constructor(readonly bytes: Uint8Array) {
		this.end = bytes.length;
	}

	/** Big-endian unsigned integer of `size` bytes (0, 1, 2, 4 or 8). */
	uint(size: number) {
		check([0, 1, 2, 4, 8].includes(size));
		let value = 0;
		for (const byte of this.slice(this.at, this.at + size, this.end)) {
			value = value * 256 + byte;
		}
		this.at += size;
		check(Number.isSafeInteger(value));
		return value;
	}

	slice(start: number, end: number, limit = this.bytes.length) {
		check(
			Number.isSafeInteger(start) &&
				Number.isSafeInteger(end) &&
				start >= 0 &&
				end >= start &&
				end <= limit,
		);
		return this.bytes.subarray(start, end);
	}

	fourcc() {
		const start = this.at;
		this.uint(4);
		return String.fromCharCode(...this.bytes.subarray(start, this.at));
	}

	/** Positions at a full box's content and returns its version byte. */
	open(box: Box) {
		this.at = box.start;
		this.end = box.end;
		return this.uint(4) >>> 24;
	}

	/** Boxes in [start, end), each spanning its content. */
	boxes(start: number, end: number) {
		this.slice(start, end);
		this.end = end;
		const list: Box[] = [];
		for (this.at = start; this.at < end; ) {
			const head = this.at;
			const size = this.uint(4);
			const type = this.fourcc();
			const length = size === 1 ? this.uint(8) : size === 0 ? end - head : size;
			check(length >= this.at - head && length <= end - head);
			list.push({ type, start: this.at, end: head + length });
			this.at = head + length;
		}
		return list;
	}

	content(box: Box) {
		return this.slice(box.start, box.end);
	}
}

function find(boxes: Box[], type: string) {
	const box = boxes.find((b) => b.type === type);
	if (!box) {
		throw new Error(`HEIF: missing ${type} box`);
	}
	return box;
}

/** iinf: item id → item type. */
function itemTypes(reader: Reader, iinf: Box) {
	const types = new Map<number, string>();
	const version = reader.open(iinf);
	const count = reader.uint(version === 0 ? 2 : 4);
	for (const infe of reader.boxes(reader.at, iinf.end).slice(0, count)) {
		const version = reader.open(infe);
		const id = reader.uint(version === 2 ? 2 : 4);
		reader.at += 2;
		types.set(id, reader.fourcc());
	}
	return types;
}

/** iloc: item id → its bytes, joining extents from the file or the idat box. */
function itemData(reader: Reader, iloc: Box, idat?: Box) {
	const data = new Map<number, Uint8Array>();
	const version = reader.open(iloc);
	const sizes = reader.uint(2);
	const [offsetSize, lengthSize, baseSize] = [
		sizes >> 12,
		(sizes >> 8) & 15,
		(sizes >> 4) & 15,
	];
	const indexSize = version === 0 ? 0 : sizes & 15;
	const idSize = version < 2 ? 2 : 4;
	for (let count = reader.uint(idSize); count > 0; count--) {
		const id = reader.uint(idSize);
		const method = version === 0 ? 0 : reader.uint(2) & 15;
		check(method <= 1 && (method === 0 || idat));
		const dataReference = reader.uint(2);
		check(dataReference === 0);
		const base =
			reader.uint(baseSize) + (method === 1 ? (idat?.start ?? 0) : 0);
		const extents = Array.from({ length: reader.uint(2) }, () => {
			reader.uint(indexSize);
			const start = base + reader.uint(offsetSize);
			const length = reader.uint(lengthSize);
			return reader.slice(
				start,
				start + length,
				method === 1 ? idat?.end : reader.bytes.length,
			);
		});
		const joined = new Uint8Array(
			extents.reduce((n, e) => n + e.byteLength, 0),
		);
		let at = 0;
		for (const extent of extents) {
			joined.set(extent, at);
			at += extent.byteLength;
		}
		data.set(id, joined);
	}
	return data;
}

/** iprp: item id → its property boxes (ipco entries, associated through ipma). */
function itemProperties(reader: Reader, iprp: Box) {
	const children = reader.boxes(iprp.start, iprp.end);
	const ipco = find(children, "ipco");
	const properties = reader.boxes(ipco.start, ipco.end);
	const associations = new Map<number, Box[]>();
	for (const ipma of children.filter((b) => b.type === "ipma")) {
		reader.at = ipma.start;
		reader.end = ipma.end;
		const versionFlags = reader.uint(4);
		const wide = versionFlags & 1;
		for (let count = reader.uint(4); count > 0; count--) {
			const id = reader.uint(versionFlags >>> 24 === 0 ? 2 : 4);
			const boxes = Array.from({ length: reader.uint(1) }, () => {
				const index = reader.uint(wide ? 2 : 1) & (wide ? 0x7fff : 0x7f);
				check(index <= properties.length);
				return properties[index - 1];
			});
			associations.set(
				id,
				boxes.filter((b) => b !== undefined),
			);
		}
	}
	return associations;
}

/** iref dimg: derived item id → source item ids, in order. */
function itemSources(reader: Reader, iref?: Box) {
	const sources = new Map<number, number[]>();
	if (iref) {
		const idSize = reader.open(iref) === 0 ? 2 : 4;
		for (const ref of reader.boxes(reader.at, iref.end)) {
			reader.at = ref.start;
			reader.end = ref.end;
			const from = reader.uint(idSize);
			const to = Array.from({ length: reader.uint(2) }, () =>
				reader.uint(idSize),
			);
			if (ref.type === "dimg") {
				sources.set(from, to);
			}
		}
	}
	return sources;
}

/** WebCodecs codec string for an HEVC decoder configuration record (hvcC). */
function codecOf(hvcC: Uint8Array) {
	check(hvcC.length >= 23 && hvcC[0] === 1);
	const profile = hvcC[1] ?? 0;
	const view = new DataView(hvcC.buffer, hvcC.byteOffset, hvcC.byteLength);
	let compatibility = 0;
	for (let i = 0; i < 32; i++) {
		compatibility =
			((compatibility << 1) | ((view.getUint32(2) >>> i) & 1)) >>> 0;
	}
	const constraints = Array.from(hvcC.subarray(6, 12), (b) =>
		b.toString(16).padStart(2, "0"),
	);
	while (constraints.at(-1) === "00") {
		constraints.pop();
	}
	const space = ["", "A", "B", "C"][profile >> 6];
	const tier = profile & 0x20 ? "H" : "L";
	return [
		`hvc1.${space}${profile & 31}`,
		compatibility.toString(16),
		`${tier}${hvcC[12]}`,
		...constraints,
	].join(".");
}

/** ispe: [width, height]. */
function sizeOf(ispe: Uint8Array) {
	check(ispe.length >= 12);
	const view = new DataView(ispe.buffer, ispe.byteOffset, ispe.byteLength);
	return [view.getUint32(4), view.getUint32(8)] as const;
}

export function parseHeic(bytes: Uint8Array) {
	const reader = new Reader(bytes);
	const meta = find(reader.boxes(0, reader.bytes.byteLength), "meta");
	const boxes = reader.boxes(meta.start + 4, meta.end);
	const version = reader.open(find(boxes, "pitm"));
	const primary = reader.uint(version === 0 ? 2 : 4);
	const types = itemTypes(reader, find(boxes, "iinf"));
	const data = itemData(
		reader,
		find(boxes, "iloc"),
		boxes.find((b) => b.type === "idat"),
	);
	const properties = itemProperties(reader, find(boxes, "iprp"));
	const sources = itemSources(
		reader,
		boxes.find((b) => b.type === "iref"),
	);
	const property = (id: number, type: string) => {
		const box = properties.get(id)?.find((b) => b.type === type);
		return box && reader.content(box);
	};

	const grid = types.get(primary) === "grid" ? data.get(primary) : undefined;
	const items = grid ? (sources.get(primary) ?? []) : [primary];
	const hvcC = property(items[0] ?? primary, "hvcC");
	const ispe = property(primary, "ispe");
	if (!hvcC || !ispe) {
		throw new Error("HEIF: primary item is not an HEVC image");
	}
	const [width, height] = sizeOf(ispe);
	const columns = grid ? (grid[3] ?? 0) + 1 : 1;
	check(width > 0 && height > 0 && items.length > 0);
	check(
		!grid || (grid.length >= 8 && items.length === (grid[2] + 1) * columns),
	);
	const chunks = items.map((id) => {
		const bytes = data.get(id);
		check(types.get(id) === "hvc1" && bytes?.length);
		return bytes;
	});
	return {
		width,
		height,
		columns,
		rotation: (property(primary, "irot")?.[0] ?? 0) & 3,
		codec: codecOf(hvcC),
		description: hvcC,
		chunks,
	};
}

export async function decodeHeic(file: Blob) {
	const { chunks, codec, description, ...image } = parseHeic(
		new Uint8Array(await file.arrayBuffer()),
	);
	const tiles: VideoFrame[] = [];
	let failure: DOMException | undefined;
	const decoder = new VideoDecoder({
		output: (frame) => {
			tiles[frame.timestamp] = frame;
		},
		error: (error) => {
			failure = error;
		},
	});
	try {
		decoder.configure({ codec, description });
		for (const [timestamp, data] of chunks.entries()) {
			decoder.decode(new EncodedVideoChunk({ type: "key", timestamp, data }));
		}
		await decoder.flush();
		check(chunks.every((_, index) => tiles[index]));
		return { ...image, tiles };
	} catch (error) {
		for (const frame of tiles) {
			frame?.close();
		}
		throw failure ?? error;
	} finally {
		if (decoder.state !== "closed") {
			decoder.close();
		}
	}
}
