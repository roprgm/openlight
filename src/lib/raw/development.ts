import type { RawSource } from "raw-webgpu";
import { type Gpu, target } from "vgpu";
import type { RawPass } from "@/lib/image-source";

/** A developed snapshot; its input source is owned by the image, not this pass. */
export function createDevelopment(
	gpu: Gpu,
	original: RawSource,
	prepareSource?: () => Promise<RawSource>,
): RawPass {
	const output = target(gpu, { size: original.size, format: "rgba16float" });
	let source = original;
	let pass = source.createDevelopPass();
	let calibration = source.calibration;
	let dirty = true;
	let disposed = false;
	return {
		async prepare(balance) {
			const next = (await prepareSource?.()) ?? source;
			if (disposed) {
				throw Error("RAW development is closed.");
			}
			if (next !== source) {
				pass.dispose();
				source = next;
				pass = source.createDevelopPass();
			}
			calibration = await source.calibrate(balance);
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
