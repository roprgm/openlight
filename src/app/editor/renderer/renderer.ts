import {
	effect,
	type Frame,
	frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import type { Scene } from "@/app/scene";
import { createToneCurves } from "@/features/tone-curves/pass";
import type { View } from "@/hooks/use-pan-zoom";
import adjustmentsShader from "@/lib/adjustments/adjustments.wgsl";
import shader from "./renderer.wgsl";

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(gpu: Gpu, source: Target) {
	const adjusted = target(gpu, { size: source.size, format: source.format });
	const adjust = effect(gpu, adjustmentsShader, {
		set: { sourceSampler: sampler(gpu) },
	});
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
				frame.pass(
					adjusted,
					adjust.set({ source: source.color, adjustments: scene.adjustments }),
				);
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
			adjusted.color.dispose();
			toneCurves.dispose();
		},
	};
}
