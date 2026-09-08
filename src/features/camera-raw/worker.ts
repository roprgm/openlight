import { mat3 } from "gl-matrix";
import create from "./vendor/libraw.mjs";
import wasm from "./vendor/libraw.wasm?url";

// Column-major linear sRGB to the editor's Rec.2020 working space.
const srgbToWorking = [
	0.627404, 0.069097, 0.016391, 0.329283, 0.91954, 0.088013, 0.043313, 0.011362,
	0.895595,
];

async function decode(file: Blob) {
	if (file.size > 512_000_000) {
		throw Error("Image exceeds the 512 MB import limit.");
	}
	const module = await create({ locateFile: () => wasm });
	const bytes = new Uint8Array(await file.arrayBuffer());
	const raw = module._raw_create();
	const input = module._malloc(bytes.length);
	const meta = module._malloc(156);
	try {
		if (!raw || !input || !meta) {
			throw Error("LibRaw ran out of memory.");
		}
		module.HEAPU8.set(bytes, input);
		const opened = module._raw_open(raw, input, bytes.length);
		if (opened) {
			throw Error(`LibRaw cannot open this file (${opened}).`);
		}
		const offset = module._raw_offset(raw);
		if (!offset) {
			const status = module._raw_unpack(raw);
			if (status) {
				throw Error(`RAW decoding failed (${status}).`);
			}
		}
		if (module._raw_metadata(raw, meta)) {
			throw Error("RAW requires integer Bayer data with uniform black levels.");
		}
		const metadata = Array.from(
			module.HEAPF32.subarray(meta / 4, meta / 4 + 39),
		);
		const [width, height, pitch] = metadata;
		let data: Uint8Array<ArrayBuffer>;
		let curve = new Uint8Array(4);
		if (offset) {
			if (offset + width * height > bytes.length) {
				throw Error("Truncated Sony sensor data.");
			}
			data = bytes.slice(offset, offset + width * height);
			curve = module.HEAPU8.slice(
				module._raw_curve(raw),
				module._raw_curve(raw) + 8192,
			);
		} else {
			const pixels = module._raw_pixels(raw);
			if (!pixels || pitch !== width * 2) {
				throw Error("Unsupported RAW sensor layout.");
			}
			data = module.HEAPU8.slice(pixels, pixels + pitch * height);
		}
		if (
			!metadata.every(Number.isFinite) ||
			metadata.slice(17, 21).some((v) => v <= 0) ||
			metadata.slice(13, 17).some((v) => v >= metadata[8]) ||
			!metadata.slice(21, 30).some((v) => v !== 0)
		) {
			throw Error("RAW calibration is unavailable.");
		}
		const matrix = metadata.slice(21, 30);
		mat3.multiply(matrix, srgbToWorking, mat3.transpose([], matrix));
		return {
			data,
			curve,
			packing: Number(offset > 0),
			xyzToCamera: mat3.transpose([], metadata.slice(30, 39)),
			params: {
				size: [width, height],
				crop: metadata.slice(3, 7),
				orientation: [1, 2, 4, 3, 5, 8, 6, 7][metadata[7]],
				white: metadata[8],
				cfa: metadata.slice(9, 13),
				black: metadata.slice(13, 17),
				balance: metadata.slice(17, 21),
				matrix,
			},
		};
	} finally {
		module._raw_destroy(raw);
		module._free(input);
		module._free(meta);
	}
}
export type Sensor = Awaited<ReturnType<typeof decode>>;
self.onmessage = async ({ data }: MessageEvent<Blob>) => {
	try {
		const sensor = await decode(data);
		self.postMessage(sensor, {
			transfer: [sensor.data.buffer, sensor.curve.buffer],
		});
	} catch (error) {
		self.postMessage({ error: String(error) });
	}
};
