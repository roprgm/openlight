import { frame, type Gpu } from "vgpu";
import { createAdjustments } from "@/lib/adjustments";
import { createDenoiseBlend } from "@/lib/denoise/blend";
import { createCachedDenoising } from "@/lib/denoise/cache";
import type { Scene } from "@/lib/editor/scene";
import { createImageFrame } from "@/lib/image-frame";
import type { ImageSource, WhiteBalance } from "@/lib/image-source";
import { createToneCurves } from "@/lib/tone-curves";
import { createUnsharpMask } from "@/lib/unsharp-mask";

function sameBalance(a: WhiteBalance | undefined, b: WhiteBalance | undefined) {
	return a?.temperature === b?.temperature && a?.tint === b?.tint;
}

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(gpu: Gpu, resource: ImageSource) {
	const source = resource.image;
	const denoising = createCachedDenoising(gpu, resource);
	const denoise = createDenoiseBlend(gpu, source, denoising);
	const adjust = createAdjustments(gpu, source);
	const adjusted = adjust.output;
	const toneCurves = createToneCurves(gpu, adjusted);
	const clarity = createUnsharpMask(gpu, source, 16);
	const sharpen = createUnsharpMask(gpu, source);

	const transform = createImageFrame(gpu);
	const release = resource.retain();
	const raw = resource.raw?.createPass();
	let original = source;
	let input = adjusted;
	let fullImage = adjusted;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = adjusted;
	let balance = resource.raw?.asShot;
	let next: Scene | undefined;
	let pending: Promise<void> | undefined;
	let disposed = false;
	function render(scene: Scene) {
		frame(gpu, (frame) => {
			const developed = raw?.render() ?? source;
			const filtered = denoise.render(
				frame,
				scene.noiseReduction ?? 0,
				developed,
			);
			adjust.render(frame, scene.adjustments, filtered);
			const curved = toneCurves.render(frame, scene.toneCurve);
			const { clarity: amount, sharpening, sharpenRadius } = scene.adjustments;
			const clarified = clarity.render(frame, curved, amount / 200, 64);
			fullImage = sharpen.render(
				frame,
				clarified,
				sharpening / 50,
				sharpenRadius,
			);
			[original, input, output] = transform.render(
				frame,
				[source, adjusted, fullImage],
				scene.frame,
			);
		});
		rendered = true;
		for (const listener of listeners) {
			listener();
		}
	}
	/** Coalesce edits while calibration or shared denoising is pending. */
	async function develop() {
		while (next && !disposed) {
			const scene = next;
			next = undefined;
			const selected = scene.whiteBalance ?? resource.raw?.asShot;
			if (raw && selected && !sameBalance(balance, selected)) {
				await raw.prepare(selected);
				if (disposed) {
					return;
				}
				balance = selected;
			}
			if ((scene.noiseReduction ?? 0) > 0 && !next) {
				await denoising.prepare(selected);
				if (disposed) {
					return;
				}
			}
			if (!next) {
				render(scene);
			}
		}
	}
	async function update(scene: Scene): Promise<void> {
		if (disposed) {
			throw Error("Renderer is closed.");
		}
		if (!resource.raw && !pending && !(scene.noiseReduction ?? 0)) {
			render(scene);
			return;
		}
		next = scene;
		pending ??= develop()
			.catch((error) => {
				if (!next) {
					throw error;
				}
			})
			.finally(() => {
				pending = undefined;
				if (next && !disposed) {
					return update(next);
				}
			});
		return pending;
	}

	return {
		originalImage: () => original,
		inputImage: () => input,
		fullImage: () => fullImage,
		outputImage: () => output,
		subscribe(listener: () => void) {
			listeners.add(listener);
			if (rendered) {
				listener();
			}
			return () => {
				listeners.delete(listener);
			};
		},
		update,
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			listeners.clear();
			adjust.dispose();
			denoise.dispose();
			denoising.dispose();
			toneCurves.dispose();
			clarity.dispose();
			sharpen.dispose();
			transform.dispose();
			raw?.dispose();
			release();
		},
	};
}
