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
import type { View } from "@/hooks/use-pan-zoom";
import { createAdjustments } from "@/lib/adjustments";
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

	const cropInput = createCrop(gpu);
	const cropOutput = createCrop(gpu);
	const cropOriginal = createCrop(gpu);
	let input = adjusted;
	let original = source;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = adjusted;
	return {
		inputImage: () => input,
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
				const curved = toneCurves.render(frame, scene.toneCurve);
				input = cropInput.render(frame, adjusted, scene.geometry);
				output =
					curved === adjusted
						? input
						: cropOutput.render(frame, curved, scene.geometry);
				original = cropOriginal.render(frame, source, scene.geometry);
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
					params: {
						size: canvas.size,
						sourceSize: image.size,
						pan: view.pan.map((p) => p * canvas.dpr),
						zoom: view.zoom,
						split: preview?.comparison === "split" ? preview.split : -1,
						shadows: Number(preview?.shadows ?? false),
						highlights: Number(preview?.highlights ?? false),
					},
				}),
			);
		},
		dispose() {
			listeners.clear();
			adjust.dispose();
			toneCurves.dispose();
			cropInput.dispose();
			cropOutput.dispose();
			cropOriginal.dispose();
		},
	};
}
