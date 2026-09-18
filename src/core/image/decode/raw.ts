import { createRawDecoder, type RawDecoder } from "raw-webgpu";
import { type Gpu, type Target, target } from "vgpu";
import { createImageSource } from "@/core/image";
import { createDevelopment } from "./development";

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
		const loader = decoder;
		return createImageSource(original, {
			asShot: source.asShot,
			createPass: () => createDevelopment(gpu, source),
			sensor: {
				metadata: source.metadata,
				async clone(signal) {
					const copy = await loader.load(file, { signal });
					return {
						metadata: copy.metadata,
						texture: copy.texture,
						createPass: () => createDevelopment(gpu, copy),
						dispose: () => copy.dispose(),
					};
				},
			},
			dispose: () => source.dispose(),
		});
	} catch (error) {
		original?.color.dispose();
		source.dispose();
		throw error;
	}
}
