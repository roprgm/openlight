import {
	type Effect,
	effect,
	frame,
	type Gpu,
	type Target,
	target,
} from "vgpu";
import { createImageSource } from "@/lib/image-source";
import shader from "./tiff.wgsl";

const transfers = new WeakMap<Gpu, Effect>();

/** Transfers package-owned pixels into the editor's owned vgpu target, entirely on GPU. */
export async function decodeTiff(gpu: Gpu, file: File) {
	const { decodeTiff } = await import("raw-webgpu");
	const decoded = await decodeTiff(gpu.gpu, file);
	let image: Target | undefined;
	try {
		const transfer = transfers.get(gpu) ?? effect(gpu, shader);
		transfers.set(gpu, transfer);
		const output = target(gpu, { size: decoded.size, format: "rgba16float" });
		image = output;
		frame(gpu, (frame) =>
			frame.pass(
				output,
				transfer.set({ source: decoded.texture.createView() }),
			),
		);
		return createImageSource(image);
	} catch (error) {
		image?.color.dispose();
		throw error;
	} finally {
		decoded.dispose();
	}
}
