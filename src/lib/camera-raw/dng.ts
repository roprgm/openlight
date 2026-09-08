import { mat3 } from "gl-matrix";
// Straight from the modules, so the worker bundle carries no shaders.
import {
	type Directory,
	parseTiff,
	readTiff,
	type TiffInfo,
} from "@/lib/tiff-gpu/ifd";
import { type Prepared, prepareTiff } from "@/lib/tiff-gpu/prepare";

/** A Bayer DNG's raw image and the camera data needed to develop it. */
export type RawImage = {
	/** Layout of the sensor mosaic, kept in stored orientation with 16-bit samples. */
	image: TiffInfo;
	orientation: number;
	/** Visible area, in stored pixels: x, y, width, height. */
	crop: number[];
	/** 2×2 CFA colors, row-major: 0 red, 1 green, 2 blue. */
	pattern: number[];
	black: number;
	white: number;
	/** Camera response to the scene's white, per channel. */
	neutral: number[];
	/** Camera RGB to linear Rec.2020, column-major. */
	matrix: number[];
};

export type PreparedDng = { prepared: Prepared; raw: RawImage };

function invert(m: mat3) {
	const inverted = mat3.invert(mat3.create(), m);
	if (!inverted) {
		throw new Error("DNG color matrix is singular.");
	}
	return inverted;
}

const xyzToRec2020 = mat3.fromValues(
	1.7166512,
	-0.6666844,
	0.0176399,
	-0.3556708,
	1.6164812,
	-0.0427706,
	-0.2533663,
	0.0157685,
	0.9421031,
);

/** Finds the raw mosaic among the directories and reads the tags that develop it. */
export function readDng(bytes: ArrayBuffer): RawImage {
	const tiff = readTiff(bytes);
	const isMosaic = (d: Directory) => tiff.value(d, 262)?.[0] === 32803;
	const directory = tiff.directories
		.flatMap((d) => [d, ...d.subdirectories])
		.find(isMosaic);
	if (!directory) {
		throw new Error("DNG has no Bayer mosaic; only CFA files are supported.");
	}
	const numbers = (tag: number, fallback: number[] = []) => {
		const value =
			tiff.value(directory, tag) ?? tiff.value(tiff.directories[0], tag);
		return typeof value === "string" || !value ? fallback : value;
	};
	const image = parseTiff(bytes, directory);
	if (image.samplesPerPixel !== 1 || numbers(33421, [2, 2]).join() !== "2,2") {
		throw new Error("Only 2×2 Bayer mosaics are supported.");
	}
	const [top, left] = numbers(50829, [0, 0, image.height, image.width]);
	const [x, y] = numbers(50719, [0, 0]);
	const [width, height] = numbers(50720, [
		image.width - left - x,
		image.height - top - y,
	]);
	const black = numbers(50714, [0]);
	// Two matrices come with their illuminants; daylight (21) matches the working white.
	const candidates = [
		[50721, 50778],
		[50722, 50779],
	]
		.map(([m, i]) => ({ matrix: numbers(m), illuminant: numbers(i, [0])[0] }))
		.filter((c) => c.matrix.length === 9);
	const chosen =
		candidates.find((c) => c.illuminant === 21) ?? candidates.at(-1);
	if (!chosen) {
		throw new Error("DNG has no color matrix.");
	}
	// The file gives XYZ to camera, row-major. Camera to Rec.2020 is its inverse through XYZ, with each
	// row scaled to sum to one so the camera's balanced white stays white.
	const xyzToCamera = mat3.transpose(
		mat3.create(),
		chosen.matrix as unknown as mat3,
	);
	const rec2020ToCamera = mat3.multiply(
		mat3.create(),
		xyzToCamera,
		invert(xyzToRec2020),
	);
	const matrix = [...invert(rec2020ToCamera)];
	for (let r = 0; r < 3; r++) {
		const sum = matrix[r] + matrix[r + 3] + matrix[r + 6];
		for (const c of [r, r + 3, r + 6]) matrix[c] /= sum;
	}
	return {
		// Lossless JPEG comes out as 16-bit little-endian samples whatever the tag says.
		image: {
			...image,
			orientation: 1,
			...(image.compression === 7
				? { bitsPerSample: 16, littleEndian: true }
				: {}),
		},
		orientation: numbers(274, [1])[0],
		crop: [left + x, top + y, width, height],
		pattern: numbers(33422, [0, 1, 1, 2]),
		black: black.reduce((n, v) => n + v, 0) / black.length,
		white: numbers(50717, [(1 << image.bitsPerSample) - 1])[0],
		neutral: numbers(50728, [1, 1, 1]),
		matrix,
	};
}

/** CPU half: the mosaic's rows, decompressed, with its camera data. */
export async function prepareDng(bytes: ArrayBuffer): Promise<PreparedDng> {
	const raw = readDng(bytes);
	return {
		prepared: await prepareTiff(bytes, {
			image: raw.image,
			colorSpace: "none",
		}),
		raw,
	};
}
