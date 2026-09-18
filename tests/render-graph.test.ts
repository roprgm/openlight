import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import {
	createRenderGraph,
	input,
	merge,
	node,
	pipeline,
	split,
} from "@/core/renderer";

const shader = `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> weights: array<f32>;
@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
	return mix(textureLoad(source, vec2i(p.xy), 0), textureLoad(base, vec2i(p.xy), 0), weights[0]);
}`;
const options = { storage: { weights: new Float32Array([0.5]) } };

test("pipeline and split preserve order, bypasses, and named merge inputs", async () => {
	const gpu = await init();
	const image = target(gpu, { size: [8, 4], format: "rgba16float" });
	const source = input(image);
	try {
		const first = node("first", shader);
		const last = node("last", shader);
		const result = pipeline(source, [
			first,
			undefined,
			(image) => pipeline(image, [last]),
		]);
		expect(result).toMatchObject({
			name: "last",
			inputs: { source: { name: "first", inputs: { source } } },
		});
		expect(pipeline(source, [undefined])).toBe(source);
		const [unchanged, small] = split(result, [
			[],
			[node("small", shader, { size: [2, 1] })],
		]);
		expect(unchanged).toBe(result);
		expect(small).toMatchObject({ inputs: { source: result }, size: [2, 1] });
		const joined = merge({ base: source, source: small }, node("join", shader));
		expect(joined.inputs.base).toBe(source);
		expect(joined.inputs.source).toBe(small);
		expect(joined.size).toEqual([8, 4]);
		expect(joined.format).toBe("rgba16float");
		expect(
			getMockGPUDeviceInstrumentation(gpu.gpu).calls.createRenderPipeline ?? 0,
		).toBe(0);
	} finally {
		image.color.dispose();
		gpu.dispose();
	}
});

test("a shared branch renders once and reuses effects, buffers, and temporary storage", async () => {
	const gpu = await init();
	const image = target(gpu, { size: [8, 8], format: "rgba16float" });
	const source = input(image);
	const graph = createRenderGraph(gpu);
	const shared = merge(
		{ source, base: source },
		node("shared", shader, options),
	);
	const middle = merge(
		{ source: shared, base: shared },
		node("middle", shader, options),
	);
	const branch = merge(
		{ source: middle, base: middle },
		node("branch", shader, options),
	);
	const joined = merge(
		{ source: shared, base: branch },
		node("join", shader, options),
	);
	try {
		const [saved, output] = graph.render([shared, joined]);
		expect(output).not.toBe(saved);
		expect(graph.inspect().passes).toEqual([
			"shared",
			"middle",
			"branch",
			"join",
		]);
		expect(graph.inspect().textures).toHaveLength(3);
		const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
		const buffers = calls.createBuffer;
		const pipelines = calls.createRenderPipeline;
		expect(graph.render([shared, joined])).toEqual([saved, output]);
		expect(graph.render([joined, shared, joined])).toEqual([
			output,
			saved,
			output,
		]);
		expect(calls.createBuffer).toBe(buffers);
		expect(calls.createRenderPipeline).toBe(pipelines);
		// Bypassing releases scratch storage; a changed output size reuses the remaining target.
		expect(graph.render([shared])[0]).toBe(saved);
		expect(graph.inspect().textures).toHaveLength(1);
		expect(() => output.color.view).toThrow("destroyed");
		const small = merge(
			{ source, base: source },
			node("shared", shader, {
				...options,
				size: [4, 4],
			}),
		);
		expect(graph.render([small])[0].size).toEqual([4, 4]);
		expect(graph.inspect().textures).toHaveLength(1);
		// Removing a composition retires its cached effect so its name can be reused.
		graph.release("shared");
		const replacement = merge(
			{ source, base: source },
			node("shared", shader.replace("weights[0]", "1.0 - weights[0]"), options),
		);
		expect(() => graph.render([replacement])).not.toThrow();
		graph.dispose();
		expect(() => saved.color.view).toThrow("destroyed");
		expect(() => image.color.view).not.toThrow();
		expect(() => graph.render([shared])).toThrow("closed");
	} finally {
		graph.dispose();
		image.color.dispose();
		gpu.dispose();
	}
});
