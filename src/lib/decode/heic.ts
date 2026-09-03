/**
 * HEIC through the browser's HEVC decoder (WebCodecs). Reads just enough HEIF to find the primary
 * image — one hvc1 item or a grid of hvc1 tiles — and composes the decoded frames on a canvas.
 */

type Box = { type: string; start: number; end: number };

class Reader {
	at = 0;
	readonly view: DataView;

	constructor(readonly bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	/** Big-endian unsigned integer of `size` bytes (0, 1, 2, 4 or 8). */
	uint(size: number) {
		const at = this.at;
		this.at += size;
		switch (size) {
			case 1:
				return this.view.getUint8(at);
			case 2:
				return this.view.getUint16(at);
			case 4:
				return this.view.getUint32(at);
			case 8:
				return Number(this.view.getBigUint64(at));
			default:
				return 0;
		}
	}

	fourcc() {
		const start = this.at;
		this.at += 4;
		return String.fromCharCode(...this.bytes.subarray(start, this.at));
	}

	/** Positions at a full box's content and returns its version byte. */
	open(box: Box) {
		this.at = box.start;
		return this.uint(4) >>> 24;
	}

	/** Boxes in [start, end), each spanning its content. */
	boxes(start: number, end: number) {
		const list: Box[] = [];
		for (this.at = start; this.at + 8 <= end; ) {
			const head = this.at;
			const size = this.uint(4);
			const type = this.fourcc();
			const length = size === 1 ? this.uint(8) : size === 0 ? end - head : size;
			list.push({ type, start: this.at, end: head + length });
			this.at = head + length;
		}
		return list;
	}

	content(box: Box) {
		return this.bytes.subarray(box.start, box.end);
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
	const count = reader.uint(reader.open(iinf) === 0 ? 2 : 4);
	for (const infe of reader.boxes(reader.at, iinf.end).slice(0, count)) {
		const id = reader.uint(reader.open(infe) === 2 ? 2 : 4);
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
		reader.at += 2;
		const base =
			reader.uint(baseSize) + (method === 1 ? (idat?.start ?? 0) : 0);
		const extents = Array.from({ length: reader.uint(2) }, () => {
			reader.at += indexSize;
			const start = base + reader.uint(offsetSize);
			return reader.bytes.subarray(start, start + reader.uint(lengthSize));
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
		const versionFlags = reader.uint(4);
		const wide = versionFlags & 1;
		for (let count = reader.uint(4); count > 0; count--) {
			const id = reader.uint(versionFlags >>> 24 === 0 ? 2 : 4);
			const boxes = Array.from({ length: reader.uint(1) }, () => {
				const index = reader.uint(wide ? 2 : 1) & (wide ? 0x7fff : 0x7f);
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
	const profile = hvcC[1] ?? 0;
	const view = new DataView(hvcC.buffer, hvcC.byteOffset);
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
	const view = new DataView(ispe.buffer, ispe.byteOffset);
	return [view.getUint32(4), view.getUint32(8)] as const;
}

export default async function decodeHeic(file: Blob) {
	const reader = new Reader(new Uint8Array(await file.arrayBuffer()));
	const meta = find(reader.boxes(0, reader.bytes.byteLength), "meta");
	const boxes = reader.boxes(meta.start + 4, meta.end);
	const primary = reader.uint(reader.open(find(boxes, "pitm")) === 0 ? 2 : 4);
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

	const tiles: VideoFrame[] = [];
	await new Promise<void>((resolve, reject) => {
		const decoder = new VideoDecoder({
			output: (frame) => {
				tiles[frame.timestamp] = frame;
			},
			error: (error) => {
				for (const frame of tiles) {
					frame?.close();
				}
				reject(error);
			},
		});
		decoder.configure({ codec: codecOf(hvcC), description: hvcC });
		items.forEach((id, timestamp) => {
			decoder.decode(
				new EncodedVideoChunk({
					type: "key",
					timestamp,
					data: data.get(id) ?? new Uint8Array(),
				}),
			);
		});
		decoder.flush().then(() => {
			decoder.close();
			resolve();
		}, reject);
	});

	return {
		width,
		height,
		tiles,
		columns: grid ? (grid[3] ?? 0) + 1 : 1,
		rotation: (property(primary, "irot")?.[0] ?? 0) & 3,
	};
}
