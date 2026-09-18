import { effect, frame, type Gpu, target } from "vgpu";
import shader from "./linearize.wgsl";
import type { Decoded } from "./types";

type Size = [number, number];

/** Display P3 primaries, which TypeScript's VideoColorPrimaries doesn't list yet. */
const isP3 = (frame?: VideoFrame) =>
	(frame?.colorSpace.primaries as string) === "smpte432";

/** A texture whose format decodes sRGB-encoded bytes to linear when read. */
function staging(gpu: Gpu, size: Size) {
	return gpu.device.createTexture({
		size,
		format: "rgba8unorm-srgb",
		usage: ["texture_binding", "copy_dst", "render_attachment"],
	});
}

/** Uploads the decoded image into a staging texture, tiles laid out on their grid. */
function stage(gpu: Gpu, decoded: Decoded) {
	const queue = gpu.gpu.queue;
	const size: Size = [decoded.width, decoded.height];
	if (decoded instanceof ImageBitmap) {
		const texture = staging(gpu, size);
		queue.copyExternalImageToTexture(
			{ source: decoded },
			{ texture: texture.gpu },
			size,
		);
		decoded.close();
		return texture;
	}
	if ("tiles" in decoded) {
		const { tiles, columns } = decoded;
		const tile: Size = [
			tiles[0]?.displayWidth ?? 0,
			tiles[0]?.displayHeight ?? 0,
		];
		const rows = Math.ceil(tiles.length / columns);
		const texture = staging(gpu, [columns * tile[0], rows * tile[1]]);
		tiles.forEach((frame, i) => {
			const origin = [
				(i % columns) * tile[0],
				Math.floor(i / columns) * tile[1],
			];
			const colorSpace = isP3(frame) ? "display-p3" : "srgb";
			queue.copyExternalImageToTexture(
				{ source: frame },
				{ texture: texture.gpu, origin, colorSpace },
				tile,
			);
			frame.close();
		});
		return texture;
	}
	const texture = staging(gpu, size);
	queue.writeTexture(
		{ texture: texture.gpu },
		decoded.data,
		{ bytesPerRow: decoded.width * 4 },
		size,
	);
	return texture;
}

/** GPU leg for sRGB-encoded decoders: renders the decoded image into a linear Rec.2020 rgba16float target. */
export default function linearize(gpu: Gpu, decoded: Decoded) {
	const frames = "tiles" in decoded ? decoded : undefined;
	const rotation = frames?.rotation ?? 0;
	const p3 = Number(isP3(frames?.tiles[0]));
	const size: Size = [decoded.width, decoded.height];
	const source = stage(gpu, decoded);
	const image = target(gpu, {
		size: rotation % 2 ? [size[1], size[0]] : size,
		format: "rgba16float",
	});
	const params = { size, rotation, p3 };
	frame(gpu, (f) =>
		f.pass(image, effect(gpu, shader, { set: { source, params } })),
	);
	source.dispose();
	return image;
}
