import { compute, type Gpu, storage, type Target } from "vgpu";
import shader from "./bins.wgsl";

export const emptyBins = new Uint32Array(3 * 256);

export function histogram(gpu: Gpu) {
	const buffer = storage(gpu, emptyBins.byteLength);
	const counter = compute(gpu, shader, { set: { bins: buffer } });
	return {
		async read(image: Target, space: "display" | "working" = "display") {
			buffer.write(emptyBins);
			counter
				.set({
					source: image.color,
					params: { working: Number(space === "working") },
				})
				.dispatch(32, 20);
			return new Uint32Array(await buffer.read());
		},
	};
}
