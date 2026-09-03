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
import {
	type HistogramMode,
	histogramChart,
} from "@/features/histogram/histogram";
import type { View } from "@/hooks/use-pan-zoom";
import adjustmentsShader from "@/lib/adjustments/adjustments.wgsl";
import { sampleCurve } from "@/lib/curves";
import curvesShader from "@/lib/curves/curves.wgsl";
import shader from "./renderer.wgsl";

const curveSize = 1024;
export type HistogramOptions = {
	stage?: "input" | "output";
	mode?: HistogramMode;
};

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
	let bins: ReturnType<typeof histogram> | undefined;
	const display = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});

	const canvases = new Set<{ canvas: Target & { dpr: number }; view: View }>();
	const charts = {
		input: new Set<ReturnType<typeof histogramChart>>(),
		output: new Set<ReturnType<typeof histogramChart>>(),
	};
	let disposed = false;
	let sampling = false;
	async function drawHistograms(
		image: Target,
		outputs: Set<ReturnType<typeof histogramChart>>,
		space: "display" | "working",
	) {
		if (disposed || outputs.size === 0) {
			return;
		}
		bins ??= histogram(gpu);
		const counts = await bins.read(image, space);
		if (!disposed) {
			for (const draw of outputs) {
				draw(counts);
			}
		}
	}
	return {
		attachCanvas(canvas: Target & { dpr: number }, view: View) {
			const output = { canvas, view };
			canvases.add(output);
			return () => {
				canvases.delete(output);
			};
		},
		attachHistogram(
			svg: SVGSVGElement,
			{ stage = "output", mode = "rgb" }: HistogramOptions = {},
		) {
			const draw = histogramChart(svg, mode);
			charts[stage].add(draw);
			return () => {
				charts[stage].delete(draw);
			};
		},
		render(frame: Frame, scene: Scene) {
			frame.pass(
				adjusted,
				adjust.set({ source: source.color, adjustments: scene.adjustments }),
			);
			let output = adjusted;
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
			if (sampling || charts.input.size + charts.output.size === 0) {
				return;
			}
			sampling = true;
			frame.done
				.then(async () => {
					await drawHistograms(adjusted, charts.input, "working");
					await drawHistograms(output, charts.output, "display");
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
			charts.input.clear();
			charts.output.clear();
			adjusted.color.dispose();
			curved.color.dispose();
			curve.dispose();
		},
	};
}
