import type { RawMetadata, RawSource } from "raw-webgpu";
import { compute, effect, frame, type Gpu, type Target, target } from "vgpu";
import collaborative from "@/lib/denoise/collaborative.wgsl";
import { estimateNoise } from "./noise";
import packShader from "./pack.wgsl";
import resolveShader from "./resolve.wgsl";
import unpackShader from "./unpack.wgsl";

export function supportsBayerDenoising(metadata: RawMetadata) {
	return (
		metadata.demosaic === "gpu" &&
		(metadata.cfaSize ?? 2) === 2 &&
		metadata.cfa?.length === 4 &&
		metadata.sampleFormat !== "float32" &&
		Math.min(...metadata.size) >= 16
	);
}

/** Restore the checkpoint filter on an exclusively owned, undeveloped Bayer source. */
export async function denoiseBayer(
	gpu: Gpu,
	source: RawSource,
	signal: AbortSignal,
) {
	const { size: dimensions, cfa, black, white } = source.metadata;
	if (!cfa || !supportsBayerDenoising(source.metadata)) {
		throw Error("Expected an integer Bayer mosaic.");
	}
	const sensor = {
		crop: [0, 0, ...dimensions],
		black: cfa.map((c) => black[c]),
		white,
	};
	const noise = await estimateNoise(gpu, source.texture, sensor);
	signal.throwIfAborted();
	const size: [number, number] = [
		Math.ceil(dimensions[0] / 2),
		Math.ceil(dimensions[1] / 2),
	];
	const temporary: { dispose(): void }[] = [];
	function image(size: readonly [number, number], format: Target["format"]) {
		const result = target(gpu, { size, format });
		temporary.push(result.color);
		return result;
	}
	try {
		const noisy = image(size, "rgba32float"),
			pilot = image(size, "rgba32float"),
			filtered = image(size, "rgba32float");
		const accumulated = gpu.device.createBuffer({
			size: 128 * 128 * 32,
			usage: ["storage", "copy_dst"],
		});
		temporary.push(accumulated);
		const pack = effect(gpu, packShader).set({
			source: source.texture,
			params: { ...sensor, ...noise },
		});
		const filter = compute(gpu, collaborative).set({ noisy, accumulated });
		const resolve = effect(gpu, resolveShader).set({ noisy, accumulated });
		frame(gpu, (f) => f.pass(noisy, pack));
		for (const stage of [0, 1]) {
			for (let y = 0; y < size[1]; y += 128) {
				for (let x = 0; x < size[0]; x += 128) {
					signal.throwIfAborted();
					const encoder = gpu.gpu.createCommandEncoder();
					encoder.clearBuffer(accumulated.gpu);
					gpu.gpu.queue.submit([encoder.finish()]);
					filter
						.set({
							guide: stage === 0 ? noisy : pilot,
							params: {
								origin: [x, y],
								size,
								stage,
								bayer: 1,
								variance: Array.from({ length: 16 }, () => [1, 1, 1, 1]),
							},
						})
						.dispatch(40, 40);
					frame(gpu, (f) =>
						f.pass(
							{
								target: stage === 0 ? pilot : filtered,
								clear: false,
								scissor: [
									x,
									y,
									Math.min(128, size[0] - x),
									Math.min(128, size[1] - y),
								],
							},
							resolve.set({ params: { origin: [x, y] } }),
						),
					);
					await gpu.gpu.queue.onSubmittedWorkDone();
				}
			}
		}
		signal.throwIfAborted();
		const output = image(dimensions, "r16uint");
		frame(gpu, (f) =>
			f.pass(
				output,
				effect(gpu, unpackShader).set({
					source: filtered,
					params: { black: sensor.black, white, ...noise },
				}),
			),
		);
		const encoder = gpu.gpu.createCommandEncoder();
		encoder.copyTextureToTexture(
			{ texture: output.color.gpu },
			{ texture: source.texture },
			dimensions,
		);
		gpu.gpu.queue.submit([encoder.finish()]);
		await gpu.gpu.queue.onSubmittedWorkDone();
		signal.throwIfAborted();
	} finally {
		for (const resource of temporary) {
			resource.dispose();
		}
	}
}
