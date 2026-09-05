import {
	effect,
	type Frame,
	frame,
	type Gpu,
	sampler,
	type Target,
} from "vgpu";
import type { Scene } from "@/app/scene";
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

	const listeners = new Set<() => void>();
	let rendered = false;
	let output = adjusted;
	return {
		inputImage: () => adjusted,
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
				output = toneCurves.render(frame, scene.toneCurve);
			});
			rendered = true;
			for (const listener of listeners) {
				listener();
			}
		},
		draw(frame: Frame, canvas: Target & { dpr: number }, view: View) {
			if (!rendered) {
				return;
			}
			frame.pass(
				canvas,
				display.set({
					source: output.color,
					params: {
						size: canvas.size,
						sourceSize: output.size,
						pan: view.pan.map((p) => p * canvas.dpr),
						zoom: view.zoom,
					},
				}),
			);
		},
		dispose() {
			listeners.clear();
			adjust.dispose();
			toneCurves.dispose();
		},
	};
}
