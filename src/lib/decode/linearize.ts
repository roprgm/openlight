import { effect, frame, type Gpu, target } from "vgpu";
import shader from "./linearize.wgsl";
import type { Decoded } from "./types";

type Size = readonly [number, number];

/** Stages the decoded bytes in a texture whose format decodes them to linear when read. */
function stage(gpu: Gpu, decoded: Decoded, size: Size) {
	const texture = gpu.device.createTexture({
		size,
		format: "rgba8unorm-srgb",
		usage: ["texture_binding", "copy_dst", "render_attachment"],
	});
	if (decoded instanceof ImageBitmap) {
		gpu.gpu.queue.copyExternalImageToTexture(
			{ source: decoded },
			{ texture: texture.gpu },
			size,
		);
		decoded.close();
	} else {
		gpu.gpu.queue.writeTexture(
			{ texture: texture.gpu },
			decoded.data,
			{ bytesPerRow: decoded.width * 4 },
			size,
		);
	}
	return texture;
}

/** GPU leg for sRGB-encoded decoders: renders the decoded image into a linear Rec.2020 rgba16float target. */
export default function linearize(gpu: Gpu, decoded: Decoded) {
	const size: Size = [decoded.width, decoded.height];
	const source = stage(gpu, decoded, size);
	const image = target(gpu, { size, format: "rgba16float" });
	frame(gpu, (f) => f.pass(image, effect(gpu, shader, { set: { source } })));
	source.dispose();
	return image;
}
