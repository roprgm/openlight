import { effect, frame, type Gpu, target } from "vgpu";
import { workerDecoder } from "@/lib/decode/worker-decoder";
import shader from "./raster.wgsl";
import type { Raster } from "./worker";

export function createLoader(gpu: Gpu) {
	const develop = effect(gpu, shader);
	const decoder = workerDecoder<Raster>(() => import("./worker?worker"));
	return async (file: Blob) => {
		const { data, curves, width, height, ...params } = await (await decoder())(
			file,
		);
		if (Math.max(width, height) > gpu.gpu.limits.maxTextureDimension2D) {
			throw new Error("Image exceeds the GPU import limit.");
		}
		const resources: { dispose(): void }[] = [];
		let image: ReturnType<typeof target> | undefined;
		try {
			const curveBuffer = gpu.device.createBuffer({
				size: curves.byteLength,
				usage: ["storage", "copy_dst"],
			});
			resources.push(curveBuffer);
			curveBuffer.write(curves);
			const invalid = gpu.device.createBuffer({
				size: 4,
				usage: ["storage", "copy_src"],
			});
			resources.push(invalid);
			image = target(gpu, { size: [width, height], format: "rgba16float" });
			const output = image;
			const rowBytes = (width * params.channels * params.bits) / 8;
			const rows = Math.floor(
				gpu.gpu.limits.maxStorageBufferBindingSize / rowBytes,
			);
			for (let y = 0; y < height; y += rows) {
				const count = Math.min(rows, height - y);
				const aligned = new Uint8Array(Math.ceil((count * rowBytes) / 4) * 4);
				aligned.set(data.subarray(y * rowBytes, (y + count) * rowBytes));
				const input = gpu.device.createBuffer({
					size: aligned.length,
					usage: ["storage", "copy_dst"],
				});
				resources.push(input);
				input.write(aligned);
				frame(gpu, (f) =>
					f.pass(
						{
							target: output,
							clear: false,
							viewport: { y, width, height: count },
						},
						develop.set({
							packed: input,
							curves: curveBuffer,
							invalid,
							params: {
								...params,
								width,
								rowOffset: y,
								maximum: 2 ** params.bits - 1,
							},
						}),
					),
				);
			}
			if (new Uint32Array(await invalid.read(4))[0]) {
				throw new Error("TIFF color profile produces out-of-range values.");
			}
			return { image };
		} catch (error) {
			image?.color.dispose();
			throw error;
		} finally {
			for (const resource of resources) {
				resource.dispose();
			}
		}
	};
}
