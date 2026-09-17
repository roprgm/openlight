import { expect, test } from "bun:test";
import type { Target } from "vgpu";
import { effect, init, target } from "vgpu/mock";
import {
	createRenderGraph,
	type RenderImage,
	renderNode,
} from "@/engine/render-graph";

test("a shared branch renders once, survives its consumers, and reuses temporary storage", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [8, 8], format: "rgba16float" });
	const graph = createRenderGraph(gpu);
	const draw = effect(
		gpu,
		`
		@group(0) @binding(0) var source: texture_2d<f32>;
		@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
			return textureLoad(source, vec2i(p.xy), 0);
		}`,
	);
	const inputs: (readonly Target[])[] = [];
	const node = (name: string, ...sources: [RenderImage, ...RenderImage[]]) =>
		renderNode(name, sources, (images) => {
			inputs.push(images);
			return draw.set({ source: images[0].color });
		});
	const shared = node("shared", source);
	const branch = node("branch", node("middle", shared));
	const joined = node("join", shared, branch);
	try {
		const [saved, output] = graph.render([shared, joined]);
		expect(inputs).toHaveLength(4);
		expect(inputs[3][0]).toBe(saved);
		expect(inputs[2][0]).not.toBe(saved);
		expect(inputs[3][1]).not.toBe(saved);
		expect(inputs[3]).not.toContain(output);
		expect(graph.inspect().textures).toHaveLength(3);
		expect(graph.render([shared, joined])).toEqual([saved, output]);
		// Bypassing releases scratch storage; a changed output size reuses the remaining target.
		expect(graph.render([node("bypass", source)])[0]).toBe(saved);
		expect(graph.inspect().textures).toHaveLength(1);
		expect(() => output.color.view).toThrow("destroyed");
		const small = renderNode(
			"small",
			[source],
			([image]) => draw.set({ source: image.color }),
			{
				size: [4, 4],
				format: source.format,
			},
		);
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
