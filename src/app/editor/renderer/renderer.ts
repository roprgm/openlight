import {
	effect,
	type Frame,
	frame,
	type Gpu,
	sampler,
	type Target,
} from "vgpu";
import type { Preview } from "@/app/document";
import type { Scene } from "@/app/scene";
import { createCrop } from "@/features/crop/pass";
import { createToneCurves } from "@/features/tone-curves/pass";
import { createAdjustments } from "@/lib/adjustments";
import { displayView, type View } from "@/lib/image-display";
import shader from "./renderer.wgsl";

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(gpu: Gpu, source: Target) {
	const adjust = createAdjustments(gpu, source);
	const adjusted = adjust.output;
	const toneCurves = createToneCurves(gpu, adjusted);
	const display = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});

	const crop = createCrop(gpu);
	let original = source;
	let input = adjusted;
	let fullImage = adjusted;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = adjusted;
	return {
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
		update(scene: Scene) {
			frame(gpu, (frame) => {
				adjust.render(frame, scene.adjustments);
				fullImage = toneCurves.render(frame, scene.toneCurve);
				[original, input, output] = crop.render(
					frame,
					[source, adjusted, fullImage],
					scene.geometry,
				);
			});
			rendered = true;
			for (const listener of listeners) {
				listener();
			}
		},
		draw(
			frame: Frame,
			canvas: Target & { dpr: number },
			view: View,
			preview?: Preview,
			fitSize: readonly number[] = canvas.size.map(
				(value) => value / canvas.dpr,
			),
		) {
			if (!rendered) {
				return;
			}
			const image = preview?.comparison === "original" ? original : output;
			frame.pass(
				canvas,
				display.set({
					source: image.color,
					original: original.color,
					view: displayView(canvas, image.size, view, fitSize, preview),
					split: preview?.comparison === "split" ? preview.split : -1,
				}),
			);
		},
		dispose() {
			listeners.clear();
			adjust.dispose();
			toneCurves.dispose();
			crop.dispose();
		},
	};
}
