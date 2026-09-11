import { compute, effect, frame, type Gpu, type Target, target } from "vgpu";
import collaborative from "./collaborative.wgsl";
import { estimateNoise } from "./noise";
import packShader from "./pack.wgsl";
import resolveShader from "./resolve.wgsl";

/** Cached full-resolution RGB denoising; scratch memory stays below 9 MiB. */
export function createDenoising(gpu: Gpu, source: Target) {
	const controller = new AbortController();
	let filtered: Target | undefined;
	let pending: Promise<void> | undefined;
	async function calculate() {
		const variance = await estimateNoise(gpu, source);
		controller.signal.throwIfAborted();
		if (variance.every((v) => v.every((c) => c <= 1e-9))) {
			filtered = source;
			return;
		}
		const temporary: { dispose(): void }[] = [];
		function image(size: readonly number[], format: Target["format"]) {
			const image = target(gpu, { size: [size[0], size[1]], format });
			temporary.push(image.color);
			return image;
		}
		try {
			const noisy = image([512, 512], "rgba32float");
			const pilot = image([512, 512], "rgba32float");
			const output = image(source.size, source.format);
			const accumulated = gpu.device.createBuffer({
				size: 128 * 128 * 32,
				usage: ["storage", "copy_dst"],
			});
			temporary.push(accumulated);
			const pack = effect(gpu, packShader).set({ source });
			const filter = compute(gpu, collaborative).set({ noisy, accumulated });
			const resolve = effect(gpu, resolveShader).set({
				noisy,
				source,
				accumulated,
			});
			// Each 384px output tile includes a 64px halo for BOTH filtering stages.
			// Reference origins use the same four-pixel lattice across every tile.
			for (let top = 0; top < source.size[1]; top += 384) {
				for (let left = 0; left < source.size[0]; left += 384) {
					const width = Math.min(384, source.size[0] - left);
					const height = Math.min(384, source.size[1] - top);
					const size = [
						Math.ceil(width / 128) * 128 + 128,
						Math.ceil(height / 128) * 128 + 128,
					];
					controller.signal.throwIfAborted();
					frame(gpu, (f) =>
						f.pass(noisy, pack.set({ origin: [left - 64, top - 64] })),
					);
					for (const stage of [0, 1]) {
						const extent = stage === 0 ? size : [width, height];
						for (let y = 0; y < extent[1]; y += 128) {
							for (let x = 0; x < extent[0]; x += 128) {
								controller.signal.throwIfAborted();
								const origin = stage === 0 ? [x, y] : [x + 64, y + 64];
								const destination = stage === 0 ? [x, y] : [left + x, top + y];
								const encoder = gpu.gpu.createCommandEncoder();
								encoder.clearBuffer(accumulated.gpu);
								gpu.gpu.queue.submit([encoder.finish()]);
								filter
									.set({
										guide: stage === 0 ? noisy : pilot,
										params: { origin, size, stage, variance },
									})
									.dispatch(40, 40);
								frame(gpu, (f) =>
									f.pass(
										{
											target: stage === 0 ? pilot : output,
											clear: false,
											scissor: [
												destination[0],
												destination[1],
												Math.min(128, extent[0] - x),
												Math.min(128, extent[1] - y),
											],
										},
										resolve.set({
											params: {
												origin: destination,
												offset: origin,
												stage,
											},
										}),
									),
								);
								await gpu.gpu.queue.onSubmittedWorkDone();
							}
						}
					}
				}
			}
			controller.signal.throwIfAborted();
			filtered = output;
		} finally {
			for (const resource of temporary) {
				if (resource !== filtered?.color) {
					resource.dispose();
				}
			}
		}
	}
	return {
		texture: () => filtered,
		prepare(amount: number) {
			controller.signal.throwIfAborted();
			if (amount === 0 || filtered) {
				return;
			}
			pending ??= calculate().finally(() => {
				pending = undefined;
			});
			return pending;
		},
		dispose() {
			controller.abort();
			if (filtered !== source) {
				filtered?.color.dispose();
			}
		},
	};
}
