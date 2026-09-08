function packBits(input: Uint8Array, output: Uint8Array) {
	let at = 0;
	for (let i = 0; i < input.length; ) {
		const header = input[i++];
		if (header < 128) {
			const end = i + header + 1;
			if (end > input.length || at + header + 1 > output.length) {
				throw new Error("Invalid PackBits literal.");
			}
			output.set(input.subarray(i, end), at);
			at += header + 1;
			i = end;
		} else if (header > 128) {
			const end = at + 257 - header;
			if (i === input.length || end > output.length) {
				throw new Error("Invalid PackBits repeat.");
			}
			output.fill(input[i++], at, end);
			at = end;
		}
		// Header 128 is a no-op.
	}
	return at;
}

function lzw(input: Uint8Array, output: Uint8Array) {
	// Dictionary entries link to a prefix and add one byte; no allocation per code.
	const prefix = new Uint16Array(4096);
	const suffix = new Uint8Array(4096);
	const stack = new Uint8Array(4096);
	let bit = 0,
		width = 9,
		next = 258,
		previous = -1,
		first = 0,
		at = 0;
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
			return at;
		}
		const current = code;
		let count = 0;
		if (code === next && previous >= 0) {
			stack[count++] = first;
			code = previous;
		} else if (code >= next) {
			throw new Error("Invalid TIFF LZW code.");
		}
		// Every prefix links to an earlier entry, so chains cannot cycle.
		while (code >= 258) {
			stack[count++] = suffix[code];
			code = prefix[code];
		}
		first = code;
		stack[count++] = first;
		if (at + count > output.length) {
			throw new Error("TIFF LZW exceeds the expected size.");
		}
		while (count) {
			output[at++] = stack[--count];
		}
		if (previous >= 0 && next < 4096) {
			prefix[next] = previous;
			suffix[next++] = first;
			// TIFF increases the code width one entry before ordinary LZW.
			if (next === (1 << width) - 1 && width < 12) {
				width++;
			}
		}
		previous = current;
	}
	throw new Error("Truncated TIFF LZW stream.");
}

async function deflate(input: Uint8Array, output: Uint8Array) {
	let at = 0;
	await new Blob([input.slice()])
		.stream()
		.pipeThrough(new DecompressionStream("deflate"))
		.pipeTo(
			new WritableStream({
				write(chunk) {
					if (at + chunk.length > output.length) {
						throw new Error("TIFF decompression exceeds the expected size.");
					}
					output.set(chunk, at);
					at += chunk.length;
				},
			}),
		);
	return at;
}

const codecs: Record<number, typeof packBits | typeof deflate> = {
	5: lzw,
	8: deflate,
	32773: packBits,
	32946: deflate,
};

/** Decode one TIFF strip/tile into a bounded buffer; prediction belongs to WGSL. */
export async function decompress(
	input: Uint8Array,
	compression: number,
	size: number,
) {
	if (compression === 1) {
		if (input.length !== size) {
			throw new Error("Incorrect uncompressed TIFF chunk length.");
		}
		return input;
	}
	const decode = codecs[compression];
	if (!decode) {
		throw new Error(`Unsupported TIFF compression: ${compression}.`);
	}
	const output = new Uint8Array(size);
	if ((await decode(input, output)) !== size) {
		throw new Error("Truncated TIFF pixel data.");
	}
	return output;
}
