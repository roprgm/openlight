import type { RawSource } from "raw-webgpu";
import { type Gpu, target } from "vgpu";
import type { RawPass } from "@/core/image";

/** A developed snapshot; its input source is owned by the image, not this pass. */
export function createDevelopment(gpu: Gpu, source: RawSource): RawPass {
	const output = target(gpu, { size: source.size, format: "rgba16float" });
	const pass = source.createDevelopPass();
	let calibration = source.calibration;
	let dirty = true;
	let disposed = false;
	return {
		async prepare(balance) {
			const next = await source.calibrate(balance);
			if (disposed) {
				throw Error("RAW development is closed.");
			}
			calibration = next;
			dirty = true;
		},
		render() {
			if (dirty) {
				pass.render({ destination: output.color.gpu, calibration });
				dirty = false;
			}
			return output;
		},
		dispose() {
			disposed = true;
			pass.dispose();
			output.color.dispose();
		},
	};
}
