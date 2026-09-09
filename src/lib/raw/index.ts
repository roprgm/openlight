import { createRawDecoder, type RawDecoder } from "raw-webgpu";
import { type Gpu, type Target, target } from "vgpu";
import { createImageSource } from "@/lib/image-source";

const decoders = new WeakMap<Gpu, RawDecoder>();

/** Adapts package-owned sensor sources to OpenLight's document and renderer lifetimes. */
export async function decodeRaw(gpu: Gpu, file: File) {
	let decoder = decoders.get(gpu);
	if (!decoder) {
		decoder = createRawDecoder(gpu.gpu);
		decoders.set(gpu, decoder);
	}
	const source = await decoder.load(file);
	let original: Target | undefined;
	try {
		original = target(gpu, { size: source.size, format: "rgba16float" });
		const initial = source.createDevelopPass();
		try {
			initial.render({
				destination: original.color.gpu,
				calibration: source.calibration,
			});
		} finally {
			initial.dispose();
		}
		return createImageSource(original, {
			asShot: source.asShot,
			createPass() {
				const output = target(gpu, {
					size: source.size,
					format: "rgba16float",
				});
				const pass = source.createDevelopPass();
				let calibration = source.calibration;
				let dirty = true;
				return {
					async prepare(balance) {
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
						pass.dispose();
						output.color.dispose();
					},
				};
			},
			dispose: source.dispose,
		});
	} catch (error) {
		original?.color.dispose();
		source.dispose();
		throw error;
	}
}
