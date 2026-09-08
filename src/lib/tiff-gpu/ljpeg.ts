/**
 * Lossless JPEG (ITU T.81 process 14) as DNG and Canon store it: Huffman-coded differences against
 * one of seven predictors, up to 16 bits per sample. Samples come out as little-endian 16-bit values,
 * components interleaved, so a tile encoded as two half-width components lands in raster order.
 */

type Table = {
	maxCode: Int32Array;
	minCode: Int32Array;
	first: Int32Array;
	sizes: Uint8Array;
};

function readTable(bytes: Uint8Array, at: number): Table {
	const counts = bytes.subarray(at, at + 16);
	const sizes = bytes.subarray(
		at + 16,
		at + 16 + counts.reduce((n, c) => n + c, 0),
	);
	const maxCode = new Int32Array(17).fill(-1);
	const minCode = new Int32Array(17);
	const first = new Int32Array(17);
	for (let length = 1, code = 0, index = 0; length <= 16; length++) {
		first[length] = index;
		minCode[length] = code;
		if (counts[length - 1]) {
			maxCode[length] = code + counts[length - 1] - 1;
		}
		code = (code + counts[length - 1]) << 1;
		index += counts[length - 1];
	}
	return { maxCode, minCode, first, sizes };
}

export function decodeLosslessJpeg(input: Uint8Array, output: Uint8Array) {
	const tables: Table[] = [];
	const tableOf: number[] = [];
	let at = 2;
	let width = 0;
	let height = 0;
	let precision = 0;
	let predictor = 1;
	let shift = 0;
	// Markers up to the scan; everything after SOS is entropy-coded data.
	for (let marker = input[at + 1]; marker !== 0xda; marker = input[at + 1]) {
		const length = (input[at + 2] << 8) | input[at + 3];
		const body = at + 4;
		if (marker === 0xc4) {
			for (let p = body; p < at + 2 + length; ) {
				tables[input[p] & 15] = readTable(input, p + 1);
				p += 17 + input.subarray(p + 1, p + 17).reduce((n, c) => n + c, 0);
			}
		} else if (marker === 0xc3) {
			precision = input[body];
			height = (input[body + 1] << 8) | input[body + 2];
			width = (input[body + 3] << 8) | input[body + 4];
			tableOf.length = input[body + 5];
		}
		at += 2 + length;
	}
	const scan = at + 4;
	for (let c = 0; c < tableOf.length; c++) {
		tableOf[c] = input[scan + 2 + c * 2] >> 4;
	}
	predictor = input[scan + 1 + tableOf.length * 2];
	shift = input[scan + 3 + tableOf.length * 2] & 15;
	at = scan + 4 + tableOf.length * 2;

	const count = tableOf.length;
	const samples = new Uint16Array(
		output.buffer,
		output.byteOffset,
		Math.min(output.byteLength >> 1, width * height * count),
	);
	let held = 0;
	let bits = 0;
	const bit = () => {
		if (bits === 0) {
			held = input[at++] ?? 0;
			// A data 0xFF is followed by a stuffed zero; any other follower is a marker, so the stream ended.
			if (held === 0xff) {
				if (input[at] === 0) {
					at++;
				} else {
					held = 0;
				}
			}
			bits = 8;
		}
		return (held >> --bits) & 1;
	};
	const difference = (table: Table) => {
		let code = bit();
		let length = 1;
		while (code > table.maxCode[length]) {
			code = (code << 1) | bit();
			length++;
		}
		const size =
			table.sizes[table.first[length] + code - table.minCode[length]];
		if (size === 16) {
			return 32768;
		}
		let value = 0;
		for (let i = 0; i < size; i++) {
			value = (value << 1) | bit();
		}
		return size && value < 1 << (size - 1) ? value - (1 << size) + 1 : value;
	};
	const row = width * count;
	for (let i = 0; i < samples.length; i++) {
		const x = Math.floor((i % row) / count);
		const y = Math.floor(i / row);
		const left = samples[i - count];
		const above = samples[i - row];
		let prediction: number;
		if (x === 0 && y === 0) {
			prediction = 1 << (precision - shift - 1);
		} else if (y === 0) {
			prediction = left;
		} else if (x === 0) {
			prediction = above;
		} else {
			const corner = samples[i - row - count];
			prediction = [
				left,
				above,
				corner,
				left + above - corner,
				left + ((above - corner) >> 1),
				above + ((left - corner) >> 1),
				(left + above) >> 1,
			][predictor - 1];
		}
		samples[i] =
			((prediction + difference(tables[tableOf[i % count]])) << shift) & 0xffff;
	}
}
