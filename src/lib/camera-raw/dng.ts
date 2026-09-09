// Straight from the modules, so the worker bundle carries no shaders.
import {
	type Directory,
	parseTiff,
	readTiff,
	type TiffInfo,
} from "@/lib/tiff-gpu/ifd";
import { type Prepared, prepareTiff } from "@/lib/tiff-gpu/prepare";
import { cameraMatrix } from "./color";

/** The image layout, sample corrections, and camera calibration described by a DNG. */
export type RawImage = {
	/** Layout of the samples in stored orientation. */
	image: TiffInfo;
	kind: "bayer" | "linear";
	active: number[];
	linearization: number[];
	blackRepeat: number[];
	blackDeltaH: number[];
	blackDeltaV: number[];
	orientation: number;
	/** Visible area, in stored pixels: x, y, width, height. */
	crop: number[];
	/** 2×2 CFA colors, row-major: 0 red, 1 green, 2 blue. */
	pattern: number[];
	black: number[];
	white: number[];
	/** Camera response to the scene's white, per channel. */
	neutral: number[];
	/** Camera RGB to linear Rec.2020, column-major. */
	matrix: number[];
};

export type PreparedDng = { prepared: Prepared; raw: RawImage };

const tags = {
	subfileType: 254,
	width: 256,
	height: 257,
	photometric: 262,
	orientation: 274,
	cfaRepeat: 33421,
	cfaPattern: 33422,
	cfaPlaneColor: 50710,
	linearization: 50712,
	blackRepeat: 50713,
	black: 50714,
	blackDeltaH: 50715,
	blackDeltaV: 50716,
	white: 50717,
	cropOrigin: 50719,
	cropSize: 50720,
	neutral: 50728,
	activeArea: 50829,
};
const cfa = 32803;
const linearRaw = 34892;

function directories(all: Directory[]): Directory[] {
	return all.flatMap((directory) => [
		directory,
		...directories(directory.subdirectories),
	]);
}

/** Select full-resolution CFA or LinearRaw data by tags, never by camera make/model. */
export function readDng(bytes: ArrayBuffer): RawImage {
	const tiff = readTiff(bytes);
	const value = (d: Directory, tag: number) => {
		const values = tiff.value(d, tag);
		return Array.isArray(values) ? values[0] : undefined;
	};
	const directory = directories(tiff.directories)
		.filter(
			(d) =>
				[cfa, linearRaw].includes(value(d, tags.photometric) ?? 0) &&
				!((value(d, tags.subfileType) ?? 0) & 1),
		)
		.sort(
			(a, b) =>
				(value(b, tags.width) ?? 0) * (value(b, tags.height) ?? 0) -
				(value(a, tags.width) ?? 0) * (value(a, tags.height) ?? 0),
		)[0];
	if (!directory) throw Error("DNG has no supported CFA or LinearRaw image.");
	const numbers = (tag: number, fallback: number[] = []) => {
		const value =
			tiff.value(directory, tag) ?? tiff.value(tiff.directories[0], tag);
		return typeof value === "string" || !value ? fallback : value;
	};
	const image = parseTiff(bytes, directory);
	const kind = image.photometric === cfa ? "bayer" : "linear";
	const pattern = numbers(tags.cfaPattern, [0, 1, 1, 2]);
	if (
		kind === "bayer" &&
		(image.samplesPerPixel !== 1 ||
			numbers(tags.cfaRepeat, [2, 2]).join() !== "2,2" ||
			pattern.toSorted().join() !== "0,1,1,2" ||
			numbers(tags.cfaPlaneColor, [0, 1, 2]).join() !== "0,1,2")
	) {
		throw Error(
			"Unsupported CFA layout: only RGB 2×2 Bayer data is supported.",
		);
	}
	if (kind === "linear" && ![1, 3].includes(image.samplesPerPixel))
		throw Error(
			`Unsupported LinearRaw channel count: ${image.samplesPerPixel}.`,
		);
	const active = numbers(tags.activeArea, [0, 0, image.height, image.width]);
	if (
		active.length !== 4 ||
		active.some((n) => !Number.isInteger(n)) ||
		active[0] < 0 ||
		active[1] < 0 ||
		active[2] > image.height ||
		active[3] > image.width ||
		active[2] <= active[0] ||
		active[3] <= active[1]
	)
		throw Error("Invalid DNG active area.");
	const [top, left] = active;
	const [x, y] = numbers(tags.cropOrigin, [0, 0]);
	const [width, height] = numbers(tags.cropSize, [
		active[3] - left - x,
		active[2] - top - y,
	]);
	const blackRepeat = numbers(tags.blackRepeat, [1, 1]);
	if (
		blackRepeat.length !== 2 ||
		blackRepeat.some(
			(n, i) =>
				!Number.isInteger(n) ||
				n < 1 ||
				n > (i === 0 ? image.height : image.width),
		)
	)
		throw Error("Invalid DNG black-level repeat dimensions.");
	const black = numbers(
		tags.black,
		Array(blackRepeat[0] * blackRepeat[1] * image.samplesPerPixel).fill(0),
	);
	const white = numbers(
		tags.white,
		Array(image.samplesPerPixel).fill(
			image.sampleFormat === 3 ? 1 : 2 ** image.bitsPerSample - 1,
		),
	);
	const linearization = numbers(tags.linearization);
	const blackDeltaH = numbers(tags.blackDeltaH);
	const blackDeltaV = numbers(tags.blackDeltaV);
	if (
		blackRepeat.length !== 2 ||
		blackRepeat.some((n) => !Number.isInteger(n) || n < 1) ||
		black.length !== blackRepeat[0] * blackRepeat[1] * image.samplesPerPixel ||
		white.length !== image.samplesPerPixel ||
		white.some(
			(n) =>
				!Number.isFinite(n) ||
				n <= black.reduce((max, value) => Math.max(max, value), -Infinity),
		) ||
		![...black, ...blackDeltaH, ...blackDeltaV].every(Number.isFinite)
	)
		throw Error("Invalid DNG black/white levels.");
	if (
		linearization.length &&
		(image.sampleFormat === 3 ||
			linearization.some((n) => !Number.isFinite(n) || n < 0))
	)
		throw Error("Invalid DNG linearization table.");
	const neutral = numbers(tags.neutral, [1, 1, 1]);
	if (
		neutral.length !== 3 ||
		neutral.some((n) => !Number.isFinite(n) || n <= 0)
	)
		throw Error("Invalid DNG as-shot neutral.");
	if (
		[left + x, top + y, width, height].some((n) => !Number.isInteger(n)) ||
		width < 1 ||
		height < 1 ||
		left + x < 0 ||
		top + y < 0 ||
		left + x + width > image.width ||
		top + y + height > image.height
	)
		throw Error("Invalid DNG crop.");
	return {
		kind,
		active,
		linearization,
		blackRepeat,
		blackDeltaH,
		blackDeltaV,
		image: { ...image, orientation: 1 },
		orientation: numbers(tags.orientation, [1])[0],
		crop: [left + x, top + y, width, height],
		pattern,
		black,
		white,
		neutral,
		matrix:
			image.samplesPerPixel === 1 && kind === "linear"
				? [1, 0, 0, 0, 1, 0, 0, 0, 1]
				: cameraMatrix(numbers),
	};
}

/** CPU half: decompressed image rows and their camera metadata. */
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
