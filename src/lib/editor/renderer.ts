import { frame, type Gpu } from "vgpu";
import { createAdjustments } from "@/lib/adjustments";
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
			const developed = raw?.render(frame) ?? source;
			adjust.render(frame, scene.adjustments, developed);
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
	/** Only calibration crosses the worker; each renderer owns its GPU RAW pass. */
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
			if (!next) {
				render(scene);
			}
		}
	}
	function update(scene: Scene): Promise<void> {
		if (disposed) {
			return Promise.reject(Error("Renderer is closed."));
		}
		if (!resource.raw) {
			render(scene);
			return Promise.resolve();
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
			toneCurves.dispose();
			clarity.dispose();
			sharpen.dispose();
			transform.dispose();
			raw?.dispose();
			release();
		},
	};
}
