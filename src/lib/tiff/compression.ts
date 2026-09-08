/** TIFF entropy decoding. Pixel interpretation and standalone predictors belong to WGSL. */
export async function decompress(
	input: Uint8Array,
	compression: number,
	size: number,
): Promise<Uint8Array> {
	if (compression === 1) {
		if (input.length !== size) {
			throw new Error("Incorrect uncompressed TIFF chunk length.");
		}
		return input;
	}
	const output = new Uint8Array(size);
	let at = 0;
	if (compression === 8 || compression === 32946) {
		const reader = new Blob([input.slice()])
			.stream()
			.pipeThrough(new DecompressionStream("deflate"))
			.getReader();
		try {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}
				if (value.length > size - at) {
					throw new Error("TIFF decompression exceeds the expected size.");
				}
				output.set(value, at);
				at += value.length;
			}
		} finally {
			await reader.cancel();
		}
	} else if (compression === 32773) {
		for (let i = 0; i < input.length; ) {
			const header = input[i++];
			if (header === 128) {
				continue;
			}
			const count = header < 128 ? header + 1 : 257 - header;
			const consumed = header < 128 ? count : 1;
			if (i + consumed > input.length || at + count > size) {
				throw new Error("Invalid PackBits stream.");
			}
			if (header < 128) {
				output.set(input.subarray(i, i + count), at);
			} else {
				output.fill(input[i], at, at + count);
			}
			i += consumed;
			at += count;
		}
	} else if (compression === 5) {
		const prefix = new Uint16Array(4096),
			suffix = new Uint8Array(4096),
			stack = new Uint8Array(4096);
		let bit = 0,
			width = 9,
			next = 258,
			previous = -1,
			first = 0,
			ended = false;
		while (bit + width <= input.length * 8) {
			let code = 0;
			for (let n = 0; n < width; n++, bit++) {
				code = code * 2 + ((input[bit >> 3] >> (7 - (bit & 7))) & 1);
			}
			if (code === 256) {
				width = 9;
				next = 258;
				previous = -1;
				continue;
			}
			if (code === 257) {
				ended = true;
				break;
			}
			const current = code;
			let count = 0;
			if (code === next && previous >= 0) {
				stack[count++] = first;
				code = previous;
			} else if (code >= next) {
				throw new Error("Invalid TIFF LZW code.");
			}
			while (code >= 258 && count < 4095) {
				stack[count++] = suffix[code];
				code = prefix[code];
			}
			if (code > 255 || count >= 4095) {
				throw new Error("Invalid TIFF LZW dictionary.");
			}
			first = code;
			stack[count++] = first;
			if (at + count > size) {
				throw new Error("TIFF LZW exceeds the expected size.");
			}
			while (count) {
				output[at++] = stack[--count];
			}
			if (previous >= 0 && next < 4096) {
				prefix[next] = previous;
				suffix[next++] = first;
				if (next === (1 << width) - 1 && width < 12) {
					width++;
				}
			}
			previous = current;
		}
		if (!ended) {
			throw new Error("Truncated TIFF LZW stream.");
		}
	} else {
		throw new Error(`Unsupported TIFF/RAW compression: ${compression}.`);
	}
	if (at !== size) {
		throw new Error("Truncated TIFF pixel data.");
	}
	return output;
}
