import {
	effect,
	type Frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import type { Scene } from "@/app/scene";
import type { View } from "@/hooks/use-pan-zoom";
import adjustmentsShader from "@/lib/adjustments/adjustments.wgsl";
import { sampleCurve } from "@/lib/curves";
import curvesShader from "@/lib/curves/curves.wgsl";
import shader from "./renderer.wgsl";

const curveSize = 1024;

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(gpu: Gpu, source: Target) {
	const adjusted = target(gpu, { size: source.size, format: source.format });
	const curved = target(gpu, { size: source.size, format: source.format });
	const adjust = effect(gpu, adjustmentsShader, {
		set: { sourceSampler: sampler(gpu) },
	});
	const curve = gpu.device.createBuffer({
		size: curveSize * Float32Array.BYTES_PER_ELEMENT,
		usage: ["storage", "copy_dst"],
	});
	const applyCurve = effect(gpu, curvesShader, {
		set: { source: adjusted.color, curve },
	});
	const display = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});

	const canvases = new Set<{ canvas: Target & { dpr: number }; view: View }>();
	let output = adjusted;
	return {
		inputImage: () => adjusted,
		outputImage: () => output,
		attachCanvas(canvas: Target & { dpr: number }, view: View) {
			const output = { canvas, view };
			canvases.add(output);
			return () => {
				canvases.delete(output);
			};
		},
		render(frame: Frame, scene: Scene) {
			frame.pass(
				adjusted,
				adjust.set({ source: source.color, adjustments: scene.adjustments }),
			);
			output = adjusted;
			if (scene.curve.some((point) => point.x !== point.y)) {
				curve.write(sampleCurve(scene.curve, curveSize));
				frame.pass(curved, applyCurve);
				output = curved;
			}
			for (const { canvas, view } of canvases) {
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
			}
		},
		dispose() {
			canvases.clear();
			adjusted.color.dispose();
			curved.color.dispose();
			curve.dispose();
		},
	};
}
