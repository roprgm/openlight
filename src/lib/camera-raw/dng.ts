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
	/** Layout of the sensor mosaic, in stored orientation. */
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

const tags = {
	photometric: 262,
	orientation: 274,
	cfaRepeat: 33421,
	cfaPattern: 33422,
	black: 50714,
	white: 50717,
	cropOrigin: 50719,
	cropSize: 50720,
	colorMatrix: [50721, 50722],
	illuminant: [50778, 50779],
	neutral: 50728,
	activeArea: 50829,
};
const cfa = 32803;
const daylight = 21;

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

function invert(m: mat3) {
	const inverted = mat3.invert(mat3.create(), m);
	if (!inverted) {
		throw new Error("DNG color matrix is singular.");
	}
	return inverted;
}

/**
 * Camera RGB to Rec.2020 from the file's XYZ-to-camera matrix (row-major): the inverse through XYZ,
 * with each row scaled to sum to one so the camera's balanced white stays white.
 */
function cameraToRec2020(xyzToCamera: number[]) {
	const rec2020ToCamera = mat3.multiply(
		mat3.create(),
		mat3.transpose(mat3.create(), Float32Array.from(xyzToCamera)),
		invert(xyzToRec2020),
	);
	const matrix = [...invert(rec2020ToCamera)];
	for (let row = 0; row < 3; row++) {
		const sum = matrix[row] + matrix[row + 3] + matrix[row + 6];
		for (const i of [row, row + 3, row + 6]) matrix[i] /= sum;
	}
	return matrix;
}

/** Finds the raw mosaic among the directories and reads the tags that develop it. */
export function readDng(bytes: ArrayBuffer): RawImage {
	const tiff = readTiff(bytes);
	const isMosaic = (d: Directory) =>
		tiff.value(d, tags.photometric)?.[0] === cfa;
	const directory = tiff.directories
		.flatMap((d) => [d, ...d.subdirectories])
		.find(isMosaic);
	if (!directory) {
		throw new Error("DNG has no Bayer mosaic; only CFA files are supported.");
	}
	// Tags live on the mosaic's directory, or on the first one for file-wide ones like orientation.
	const numbers = (tag: number, fallback: number[] = []) => {
		const value =
			tiff.value(directory, tag) ?? tiff.value(tiff.directories[0], tag);
		return typeof value === "string" || !value ? fallback : value;
	};
	const image = parseTiff(bytes, directory);
	if (
		image.samplesPerPixel !== 1 ||
		numbers(tags.cfaRepeat, [2, 2]).join() !== "2,2"
	) {
		throw new Error("Only 2×2 Bayer mosaics are supported.");
	}
	const [top, left] = numbers(tags.activeArea, [0, 0]);
	const [x, y] = numbers(tags.cropOrigin, [0, 0]);
	const [width, height] = numbers(tags.cropSize, [
		image.width - left - x,
		image.height - top - y,
	]);
	const black = numbers(tags.black, [0]);
	// A matrix per illuminant; daylight matches the working white.
	const candidates = tags.colorMatrix
		.map((tag, i) => ({
			matrix: numbers(tag),
			illuminant: numbers(tags.illuminant[i], [0])[0],
		}))
		.filter((c) => c.matrix.length === 9);
	const chosen =
		candidates.find((c) => c.illuminant === daylight) ?? candidates.at(-1);
	if (!chosen) {
		throw new Error("DNG has no color matrix.");
	}
	return {
		image: { ...image, orientation: 1 },
		orientation: numbers(tags.orientation, [1])[0],
		crop: [left + x, top + y, width, height],
		pattern: numbers(tags.cfaPattern, [0, 1, 1, 2]),
		black: black.reduce((n, v) => n + v, 0) / black.length,
		white: numbers(tags.white, [(1 << image.bitsPerSample) - 1])[0],
		neutral: numbers(tags.neutral, [1, 1, 1]),
		matrix: cameraToRec2020(chosen.matrix),
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
