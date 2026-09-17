import { effect, frame, init, target, timer } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createEditorRenderer } from "@/app/editor/renderer";
import decode from "@/lib/decode";
import { defaultAdjustments, type Scene } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { defaultCurve } from "@/lib/tone-curves/curve";
import { measureFrames } from "./gpu-timing";

const warmup = 8,
	samples = 40;

/** Real decoding precedes the timing; cached renders vary only the amount slider. */
export async function benchmarkDenoising(fixture: string, active = true) {
	const bytes = await (await fetch(`/tests/fixtures/${fixture}`)).arrayBuffer();
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw Error("No WebGPU adapter. Use the project Playwright configuration.");
	}
	const gpu = await init();
	const errors: Error[] = [];
	gpu.onError((error) => errors.push(error));
	const decodeStart = performance.now();
	const source = await decode(gpu, new File([bytes], fixture));
	await gpu.gpu.queue.onSubmittedWorkDone();
	const decodeMs = performance.now() - decodeStart;
	let scene: Scene = {
		source: fixture,
		frame: imageFrame(source.image.size),
		adjustments: { ...defaultAdjustments, exposure: 0.25, contrast: 10 },
		toneCurve: defaultCurve,
		noiseReduction: 0,
	};
	const setupStart = performance.now();
	const renderer = createEditorRenderer(gpu, source);
	const setupMs = performance.now() - setupStart;
	async function renderOnce() {
		const start = performance.now();
		await renderer.update(scene);
		await gpu.gpu.queue.onSubmittedWorkDone();
		return performance.now() - start;
	}
	try {
		const firstNeutralMs = await renderOnce();
		const neutral = await measureFrames(
			gpu,
			() => renderer.update(scene),
			warmup,
			samples,
		);
		const before = [
			...new Uint8Array(
				await (await encodeImage(gpu, renderer.outputImage())).arrayBuffer(),
			),
		];
		let firstActiveMs: number | null = null;
		let cached: Awaited<ReturnType<typeof measureFrames>> | null = null;
		if (active) {
			scene = { ...scene, noiseReduction: 100 };
			firstActiveMs = await renderOnce();
			cached = await measureFrames(
				gpu,
				() => {
					scene = {
						...scene,
						noiseReduction: scene.noiseReduction === 50 ? 75 : 50,
					};
					return renderer.update(scene);
				},
				warmup,
				samples,
			);
			scene = { ...scene, noiseReduction: 100 };
			await renderer.update(scene);
		}
		const after = [
			...new Uint8Array(
				await (await encodeImage(gpu, renderer.outputImage())).arrayBuffer(),
			),
		];
		const pixels = await renderer.outputImage().readFloats();
		if (!pixels.every(Number.isFinite)) {
			throw Error("Non-finite denoising output.");
		}
		await gpu.settled();
		if (errors.length) {
			throw errors[0];
		}
		return {
			fixture,
			size: source.image.size,
			format: source.image.format,
			adapter: {
				vendor: adapter.info.vendor,
				architecture: adapter.info.architecture,
				device: adapter.info.device,
				description: adapter.info.description,
			},
			warmup,
			samples,
			decodeMs,
			setupMs,
			firstNeutralMs,
			firstActiveMs,
			neutral,
			cached,
			before,
			after,
		};
	} finally {
		renderer.dispose();
		source.dispose();
		gpu.dispose();
	}
}

/** The production amount blend over precomputed textures. No expensive denoising is timed here. */
export async function benchmarkBlend() {
	const path = "/src/features/noise-reduction/processing/blend.ts";
	const { createDenoiseBlend } = (await import(
		/* @vite-ignore */ path
	)) as typeof import("@/features/noise-reduction/processing/blend");
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw Error("No WebGPU adapter.");
	}
	const timestamps = adapter.features.has("timestamp-query");
	const gpu = await init({
		requiredFeatures: timestamps ? ["timestamp-query"] : [],
	});
	const errors: Error[] = [];
	gpu.onError((error) => errors.push(error));
	const size: [number, number] = [5000, 4000];
	const source = target(gpu, { size, format: "rgba16float" });
	const filtered = target(gpu, { size, format: source.format });
	const blend = createDenoiseBlend(gpu, source, { texture: () => filtered });
	const clock = timestamps ? timer(gpu) : undefined;
	let elapsed: number | undefined;
	clock?.onResults((spans) => {
		elapsed = spans.blend;
	});
	try {
		const fill = effect(
			gpu,
			`
   @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
    let uv = p.xy / vec2f(5000.0, 4000.0);
    return vec4f(uv.x, uv.y, 0.2, 1.0);
   }`,
		);
		frame(gpu, (f) => {
			f.pass(source, fill);
			f.pass(filtered, fill);
		});
		await gpu.gpu.queue.onSubmittedWorkDone();
		const rendering = await measureFrames(
			gpu,
			() => {
				elapsed = undefined;
				frame(gpu, (f) => {
					const pass = f.pass.bind(f);
					f.pass = (options, body) =>
						pass(
							{
								...("target" in options ? options : { target: options }),
								timer: clock?.span("blend"),
							},
							body,
						);
					blend.render(f, 50);
				});
			},
			warmup,
			samples,
			timestamps ? () => elapsed : undefined,
		);
		if (errors.length) {
			throw errors[0];
		}
		return {
			size,
			format: source.format,
			warmup,
			samples,
			timestamps,
			adapter: {
				vendor: adapter.info.vendor,
				architecture: adapter.info.architecture,
				device: adapter.info.device,
				description: adapter.info.description,
			},
			rendering,
			passCount: 1,
			outputBytes: size[0] * size[1] * 8,
		};
	} finally {
		clock?.dispose();
		blend.dispose();
		source.color.dispose();
		filtered.color.dispose();
		gpu.dispose();
	}
}
