import {
	effect,
	type Frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import type { Scene } from "@/app/scene";
import { histogram } from "@/features/histogram/bins";
import { histogramChart } from "@/features/histogram/histogram";
import type { View } from "@/hooks/use-pan-zoom";
import adjustmentsShader from "@/lib/adjustments/adjustments.wgsl";
import shader from "./renderer.wgsl";

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(gpu: Gpu, source: Target) {
	const output = target(gpu, { size: source.size, format: source.format });
	const adjust = effect(gpu, adjustmentsShader, {
		set: { sourceSampler: sampler(gpu) },
	});
	const bins = histogram(gpu);
	const display = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});

	const canvases = new Set<{ canvas: Target & { dpr: number }; view: View }>();
	const charts = new Set<ReturnType<typeof histogramChart>>();
	let disposed = false;
	let sampling = false;
	return {
		attachCanvas(canvas: Target & { dpr: number }, view: View) {
			const output = { canvas, view };
			canvases.add(output);
			return () => {
				canvases.delete(output);
			};
		},
		attachHistogram(svg: SVGSVGElement) {
			const draw = histogramChart(svg);
			charts.add(draw);
			return () => {
				charts.delete(draw);
			};
		},
		render(frame: Frame, scene: Scene) {
			frame.pass(
				output,
				adjust.set({ source: source.color, adjustments: scene.adjustments }),
			);
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
			if (sampling || charts.size === 0) {
				return;
			}
			sampling = true;
			frame.done
				.then(async () => {
					if (disposed) {
						return;
					}
					const counts = await bins.read(output);
					if (!disposed) {
						for (const draw of charts) {
							draw(counts);
						}
					}
				})
				.catch((error: unknown) => {
					if (!disposed) {
						console.error(error);
					}
				})
				.finally(() => {
					sampling = false;
				});
		},
		dispose() {
			disposed = true;
			canvases.clear();
			charts.clear();
			output.color.dispose();
		},
	};
}
