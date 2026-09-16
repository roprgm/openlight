import type { RawDecoder, RawMetadata, RawSource } from "raw-webgpu";
import type { Gpu } from "vgpu";
import { denoiseBayer, supportsBayerDenoising } from "@/lib/denoise/bayer";

/** One private filtered sensor shared by every white balance, preview and export. */
export function createBayerDenoising(
	gpu: Gpu,
	decoder: RawDecoder,
	file: File,
	metadata: RawMetadata,
) {
	if (!supportsBayerDenoising(metadata)) {
		return;
	}
	const controller = new AbortController();
	let filtered: RawSource | undefined;
	let pending: Promise<RawSource> | undefined;
	async function calculate() {
		// raw-webgpu currently binds its own input texture. A second source lets us
		// replace sensor codes before its first develop, without mutating the original.
		const source = await decoder.load(file, { signal: controller.signal });
		try {
			await denoiseBayer(gpu, source, controller.signal);
			filtered = source;
			return source;
		} catch (error) {
			source.dispose();
			throw error;
		}
	}
	return {
		prepare() {
			controller.signal.throwIfAborted();
			pending ??= calculate();
			return pending;
		},
		dispose() {
			controller.abort();
			filtered?.dispose();
		},
	};
}
