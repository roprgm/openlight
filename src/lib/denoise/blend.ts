import { effect, type Frame, type Gpu, type Target, target } from "vgpu";
import shader from "./blend.wgsl";

/** Each renderer owns its blend target; the shared cache owns the filtered image. */
export function createDenoiseBlend(
	gpu: Gpu,
	source: Target,
	denoising: { texture(): Target | undefined },
) {
	let output: Target | undefined;
	const blend = effect(gpu, shader).set({ source });
	return {
		render(frame: Frame, amount: number, input = source) {
			if (amount === 0) {
				return input;
			}
			const filtered = denoising.texture();
			if (!filtered) {
				throw Error("Prepare noise reduction before rendering it.");
			}
			if (filtered === input) {
				return input;
			}
			output ??= target(gpu, { size: source.size, format: source.format });
			frame.pass(
				output,
				blend.set({ source: input, filtered, amount: amount / 100 }),
			);
			return output;
		},
		dispose: () => output?.color.dispose(),
	};
}
