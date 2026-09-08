import type { Texture } from "@vgpu/core";
import { mat3 } from "gl-matrix";
import { effect, frame, type Gpu, target } from "vgpu";
import { parseIcc } from "./icc";
import shader from "./raster.wgsl";

const curveSize = 1024;
/** XYZ (D50) to linear Rec.2020: Bradford adaptation to D65, then the Rec.2020 primaries. Column-major. */
const xyzD50ToRec2020 = mat3.fromValues(
	1.6472945,
	-0.6826024,
	0.0296711,
	-0.3935777,
	1.6475829,
	-0.0629319,
	-0.2359823,
	0.0128128,
	1.253617,
);
/** Linear sRGB to Rec.2020, as in color.wgsl. */
const srgbToRec2020 = mat3.fromValues(
	0.6274,
	0.0691,
	0.0164,
	0.3293,
	0.9195,
	0.088,
	0.0433,
	0.0114,
	0.8956,
);
const srgbDecode = (v: number) =>
	v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const identity = (v: number) => v;

function readProfile(bytes?: Uint8Array) {
	try {
		return bytes && parseIcc(bytes);
	} catch {
		return undefined;
	}
}

/** Scaled samples plus how to read them: float16 bits or 16-bit integers, and their color encoding. */
export type RasterSource = {
	texture: Texture;
	float: boolean;
	premultiplied: boolean;
	orientation: number;
	icc?: Uint8Array;
};

/** Transfer curves sampled over 0..1 for the shader, and the matrix into the working space. */
function colorOf(raster: RasterSource) {
	const icc = readProfile(raster.icc);
	const curves =
		icc?.curves ?? Array(3).fill(raster.float ? identity : srgbDecode);
	const lut = Float32Array.from({ length: 3 * curveSize }, (_, i) =>
		curves[Math.floor(i / curveSize)]((i % curveSize) / (curveSize - 1)),
	);
	if (!lut.every(Number.isFinite)) {
		throw new Error("Invalid ICC transfer curve.");
	}
	const matrix = icc
		? mat3.multiply(mat3.create(), xyzD50ToRec2020, icc.matrix)
		: srgbToRec2020;
	return { lut, matrix };
}

/** GPU leg for full-precision rasters: orientation, alpha, transfer curves, and primaries into linear Rec.2020. */
export function importRaster(gpu: Gpu, raster: RasterSource) {
	const { texture: source, orientation } = raster;
	const [width, height] = source.size;
	const { lut, matrix } = colorOf(raster);
	const curves = gpu.device.createBuffer({
		size: lut.byteLength,
		usage: ["storage", "copy_dst"],
	});
	curves.write(lut);
	const image = target(gpu, {
		size: orientation >= 5 ? [height, width] : [width, height],
		format: "rgba16float",
	});
	const params = {
		size: [width, height],
		orientation,
		float: Number(raster.float),
		premultiplied: Number(raster.premultiplied),
		matrix: Array.from(matrix),
	};
	frame(gpu, (f) =>
		f.pass(image, effect(gpu, shader, { set: { source, curves, params } })),
	);
	curves.dispose();
	return image;
}
