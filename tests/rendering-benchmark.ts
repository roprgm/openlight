import { effect, type Frame, frame, init, target, timer } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createRenderer } from "@/lib/editor/renderer";
import { defaultAdjustments, type Scene } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { createImageSource } from "@/lib/image-source";
import { defaultCurve } from "@/lib/tone-curves/curve";

export type Workload =
	| "baseline"
	| "neutral"
	| "active"
	| "vignette-neutral"
	| "vignette-active";

function summarize(values: number[]) {
	const sorted = values.toSorted((a, b) => a - b);
	return {
		samples: values,
		median:
			(sorted[Math.floor((sorted.length - 1) / 2)] +
				sorted[Math.ceil((sorted.length - 1) / 2)]) /
			2,
		p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
	};
}

/** Runs the production passes offscreen; React, display, and export encoding are outside timings. */
export async function benchmarkRendering(
	workload: Workload,
	size: [number, number],
	warmup: number,
	samples: number,
) {
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw new Error(
			"No WebGPU adapter. Use the project's Playwright configuration.",
		);
	}
	const isVignette = workload.startsWith("vignette-");
	const active = workload === "active" || workload === "vignette-active";
	const passName = isVignette ? "vignette" : "color-mixer";
	const timestamps = adapter.features.has("timestamp-query");
	const gpu = await init({
		requiredFeatures: timestamps ? ["timestamp-query"] : [],
	});
	const errors: Error[] = [];
	gpu.onError((error) => errors.push(error));
	const input = target(gpu, { size, format: "rgba16float" });
	const source = createImageSource(input);
	const clock = timestamps ? timer(gpu) : undefined;
	let passMs: number | undefined;
	clock?.onResults((spans) => {
		passMs = spans[passName];
	});
	const intensity = active ? 80 : 0;
	const scene: Scene = {
		source: "benchmark",
		frame: imageFrame(size),
		adjustments: { ...defaultAdjustments, exposure: 0.25, contrast: 10 },
		toneCurve: defaultCurve,
		vignette: isVignette ? { intensity, softness: 60 } : undefined,
		colorMixer:
			workload === "active"
				? {
						hue: new Array<number>(8).fill(20),
						saturation: new Array<number>(8).fill(25),
						luminance: new Array<number>(8).fill(10),
					}
				: undefined,
	};
	// The baseline also runs against revisions predating the mixer.
	const path = "/src/features/color-mixer/pass.ts";
	const createMixer =
		workload === "baseline"
			? undefined
			: (
					(await import(
						/* @vite-ignore */ path
					)) as typeof import("@/features/color-mixer/pass")
				).createColorMixer;
	const vignettePath = "/src/features/vignette/pass.ts";
	const createVignette = isVignette
		? (
				(await import(
					/* @vite-ignore */ vignettePath
				)) as typeof import("@/features/vignette/pass")
			).createVignette
		: undefined;
	const editorPath = "/src/app/editor/renderer.ts";
	const createEditorRenderer = isVignette
		? (
				(await import(
					/* @vite-ignore */ editorPath
				)) as typeof import("@/app/editor/renderer")
			).createEditorRenderer
		: undefined;
	const setupStart = performance.now();
	const renderer = createEditorRenderer
		? createEditorRenderer(gpu, source)
		: createRenderer(gpu, source, createMixer);
	const rendererSetupMs = performance.now() - setupStart;
	const isolatedEffect = (createVignette ?? createMixer)?.(gpu, input);
	async function measure(render: () => void | Promise<void>, timed: boolean) {
		const encoding: number[] = [];
		const completed: number[] = [];
		const durations: number[] = [];
		for (let i = 0; i < warmup + samples; i++) {
			passMs = undefined;
			const start = performance.now();
			await render();
			const encoded = performance.now();
			await gpu.gpu.queue.onSubmittedWorkDone();
			const end = performance.now();
			await gpu.settled();
			if (errors.length) {
				throw errors[0];
			}
			if (i >= warmup) {
				encoding.push(encoded - start);
				completed.push(end - start);
				if (passMs !== undefined) {
					durations.push(passMs);
				}
			}
		}
		return {
			cpuEncodeMs: summarize(encoding),
			completedMs: summarize(completed),
			gpuMs: timed && durations.length ? summarize(durations) : null,
			missingGpuSamples:
				timed && timestamps ? samples - durations.length : null,
		};
	}
	try {
		// A deterministic linear Rec.2020 gradient spans saturated colors, neutrals, and HDR.
		const fill = effect(
			gpu,
			`
			@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
				let uv = p.xy / vec2f(${size[0]}.0, ${size[1]}.0);
				let rgb = 0.5 + 0.5 * cos(uv.x * 6.2831853 + vec3f(0.0, -2.0943951, 2.0943951));
				return vec4f(mix(vec3f(0.18), rgb * 2.0, uv.y), 1.0);
			}`,
		);
		frame(gpu, (f) => f.pass(input, fill));
		await gpu.gpu.queue.onSubmittedWorkDone();
		const start = performance.now();
		await renderer.update(scene);
		await gpu.gpu.queue.onSubmittedWorkDone();
		await gpu.settled();
		const firstRenderMs = performance.now() - start;
		const rendering = await measure(() => renderer.update(scene), false);
		const renderEffect = (f: Frame) => {
			// Instrument this owned frame only; execute the feature's actual pass unchanged.
			const pass = f.pass.bind(f);
			f.pass = (options, body) =>
				pass(
					{
						...("target" in options ? options : { target: options }),
						timer: clock?.span(passName),
					},
					body,
				);
			isolatedEffect?.render(f, input, scene);
		};
		const isolated = isolatedEffect
			? await measure(() => {
					frame(gpu, renderEffect);
				}, active)
			: null;
		const pixels = await renderer.outputImage().readFloats();
		if (!pixels.every(Number.isFinite)) {
			throw new Error("Benchmark output contains non-finite pixels.");
		}
		const blob = await encodeImage(gpu, renderer.outputImage(), {
			longEdge: 960,
		});
		return {
			workload,
			size,
			warmup,
			samples,
			timestamps,
			adapter: {
				vendor: adapter.info.vendor,
				architecture: adapter.info.architecture,
				device: adapter.info.device,
				description: adapter.info.description,
			},
			rendererSetupMs,
			firstRenderMs,
			rendering,
			isolated,
			outputBytes: active ? size[0] * size[1] * 8 : 0,
			image: [...new Uint8Array(await blob.arrayBuffer())],
		};
	} finally {
		isolatedEffect?.dispose();
		renderer.dispose();
		source.dispose();
		clock?.dispose();
		gpu.dispose();
	}
}
