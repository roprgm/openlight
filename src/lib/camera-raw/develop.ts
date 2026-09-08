import { effect, frame, type Gpu, type Target, target } from "vgpu";
import { uploadTiff } from "@/lib/tiff-gpu";
import developShader from "./develop.wgsl";
import type { PreparedDng } from "./dng";

/** GPU half: the mosaic into a float texture, then one pass that demosaics, balances, and converts it. */
export function developDng(gpu: Gpu, { prepared, raw }: PreparedDng): Target {
	const mosaic = uploadTiff(gpu, prepared, { format: "rgba32float" });
	const [x, y, width, height] = raw.crop;
	const image = target(gpu, {
		size: raw.orientation >= 5 ? [height, width] : [width, height],
		format: "rgba16float",
	});
	const params = {
		origin: [x, y],
		size: [width, height],
		orientation: raw.orientation,
		scale: (1 << raw.image.bitsPerSample) - 1,
		black: raw.black,
		white: raw.white,
		neutral: raw.neutral,
		pattern: raw.pattern,
		matrix: raw.matrix,
	};
	frame(gpu, (f) =>
		f.pass(
			image,
			effect(gpu, developShader, { set: { params, mosaic: mosaic.color } }),
		),
	);
	mosaic.color.dispose();
	return image;
}
