import { expect, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import { createRenderGraph } from "@/core/render/graph";
import { renderNode } from "@/core/render/node";

const shader = `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> weights: array<f32>;
@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
	return mix(textureLoad(source, vec2i(p.xy), 0), textureLoad(base, vec2i(p.xy), 0), weights[0]);
}`;
const options = { storage: { weights: new Float32Array([0.5]) } };

test("a shared branch renders once and reuses effects, buffers, and temporary storage", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [8, 8], format: "rgba16float" });
	const graph = createRenderGraph(gpu);
	const shared = renderNode("shared", shader, {
		inputs: { source, base: source },
		...options,
	});
	const middle = renderNode("middle", shader, {
		inputs: { source: shared, base: shared },
		...options,
	});
	const branch = renderNode("branch", shader, {
		inputs: { source: middle, base: middle },
		...options,
	});
	const joined = renderNode("join", shader, {
		inputs: { source: shared, base: branch },
		...options,
	});
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
		expect(calls.createBuffer).toBe(buffers);
		expect(calls.createRenderPipeline).toBe(pipelines);
		// Bypassing releases scratch storage; a changed output size reuses the remaining target.
		expect(graph.render([shared])[0]).toBe(saved);
		expect(graph.inspect().textures).toHaveLength(1);
		expect(() => output.color.view).toThrow("destroyed");
		const small = renderNode("shared", shader, {
			inputs: { source, base: source },
			...options,
			size: [4, 4],
		});
		expect(graph.render([small])[0].size).toEqual([4, 4]);
		expect(graph.inspect().textures).toHaveLength(1);
		graph.dispose();
		expect(() => saved.color.view).toThrow("destroyed");
		expect(() => source.color.view).not.toThrow();
	} finally {
		graph.dispose();
		source.color.dispose();
		gpu.dispose();
	}
});
