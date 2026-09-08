/** TIFF LZW (MSB-first, early change) into a preallocated output. */
export function decodeLzw(input: Uint8Array, output: Uint8Array) {
	const prefix = new Uint16Array(4096);
	const suffix = new Uint8Array(4096);
	const length = new Uint16Array(4096);
	for (let i = 0; i < 256; i++) {
		suffix[i] = i;
		length[i] = 1;
	}
	let next = 258;
	let width = 9;
	let prev = -1;
	let bit = 0;
	let out = 0;
	const bits = input.length * 8;
	while (bit + width <= bits && out < output.length) {
		const p = bit >> 3;
		const window =
			(input[p] << 16) | ((input[p + 1] ?? 0) << 8) | (input[p + 2] ?? 0);
		const code = (window >>> (24 - (bit & 7) - width)) & ((1 << width) - 1);
		bit += width;
		if (code === 256) {
			next = 258;
			width = 9;
			prev = -1;
			continue;
		}
		if (code === 257) {
			break;
		}
		if (prev < 0) {
			output[out++] = code;
			prev = code;
			continue;
		}
		let first: number;
		if (code < next) {
			const n = length[code];
			for (let k = n - 1, c = code; k >= 0; k--) {
				output[out + k] = suffix[c];
				c = prefix[c];
			}
			first = output[out];
			out += n;
		} else {
			const n = length[prev] + 1;
			for (let k = n - 2, c = prev; k >= 0; k--) {
				output[out + k] = suffix[c];
				c = prefix[c];
			}
			first = output[out];
			output[out + n - 1] = first;
			out += n;
		}
		if (next < 4096) {
			prefix[next] = prev;
			suffix[next] = first;
			length[next] = length[prev] + 1;
			next++;
		}
		if (next + 1 >= 1 << width && width < 12) {
			width++;
		}
		prev = code;
	}
}

export function decodePackBits(input: Uint8Array, output: Uint8Array) {
	let out = 0;
	for (let i = 0; i < input.length && out < output.length; ) {
		const n = (input[i++] << 24) >> 24;
		if (n >= 0) {
			const count = Math.min(n + 1, output.length - out);
			output.set(input.subarray(i, i + count), out);
			i += n + 1;
			out += count;
		} else if (n !== -128) {
			output.fill(input[i++], out, out + 1 - n);
			out += 1 - n;
		}
	}
}

export async function inflate(
	input: Uint8Array<ArrayBuffer>,
	output: Uint8Array,
) {
	const stream = new Blob([input])
		.stream()
		.pipeThrough(new DecompressionStream("deflate"));
	output.set(
		new Uint8Array(await new Response(stream).arrayBuffer()).subarray(
			0,
			output.length,
		),
	);
}

/** Predictor 3: bytes are differenced along the row, then stored as planes from most to least significant. */
export function undoFloatPrediction(
	data: Uint8Array,
	rowBytes: number,
	stride: number,
	bytesPerSample: number,
	littleEndian: boolean,
) {
	const planes = new Uint8Array(rowBytes);
	const count = rowBytes / bytesPerSample;
	for (let start = 0; start + rowBytes <= data.length; start += rowBytes) {
		const row = data.subarray(start, start + rowBytes);
		for (let i = stride; i < rowBytes; i++) {
			row[i] = (row[i] + row[i - stride]) & 255;
		}
		planes.set(row);
		for (let i = 0; i < count; i++) {
			for (let b = 0; b < bytesPerSample; b++) {
				row[i * bytesPerSample + b] =
					planes[(littleEndian ? bytesPerSample - b - 1 : b) * count + i];
			}
		}
	}
}

export type Codec = (
	input: Uint8Array<ArrayBuffer>,
	output: Uint8Array,
) => void | Promise<void>;

/** Decoders by TIFF compression code; a RAW loader adds its own here. */
export const codecs: Record<number, Codec> = {
	1: (input, output) => output.set(input.subarray(0, output.length)),
	5: decodeLzw,
	8: inflate,
	32946: inflate,
	32773: decodePackBits,
};
