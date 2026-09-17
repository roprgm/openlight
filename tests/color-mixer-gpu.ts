import { effect, frame, init, target } from "vgpu";
import { createRenderGraph } from "@/core/render/graph";
import { input as inputNode, pipeline } from "@/core/render/node";
import { colors, defaultMixer } from "@/features/color-mixer/model";
import { colorMixer } from "@/features/color-mixer/pass";
import type { ColorMixer } from "@/lib/editor/scene";

function working(rgb: number[], scale = 1) {
	const [r, g, b] = rgb.map((value) =>
		value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
	);
	return [
		(0.6274 * r + 0.3293 * g + 0.0433 * b) * scale,
		(0.0691 * r + 0.9195 * g + 0.0114 * b) * scale,
		(0.0164 * r + 0.088 * g + 0.8956 * b) * scale,
		0.5,
	];
}

/** Exercise the actual shader in the editor's float16 working space, before display clipping. */
export async function probeColorMixer() {
	const gpu = await init();
	const samples = [
		...[
			[1, 0, 0],
			[1, 0.5, 0],
			[1, 1, 0],
			[0, 1, 0],
			[0, 1, 1],
			[0, 0, 1],
			[0.5, 0, 1],
			[1, 0, 1],
		].map((rgb) => working(rgb)),
		[0, 0, 0, 0],
		[0.18, 0.18, 0.18, 1],
		[2, 2, 2, 1],
		working([1, 0, 0], 4),
		working([0, 1, 1], 4),
		[0, 1, 0, 1],
	];
	const ramp = Array.from({ length: 360 }, (_, hue) => {
		const rgb = [0, 8, 4].map((offset) => {
			const k = (offset + hue / 30) % 12;
			return 0.5 - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		});
		return working(rgb);
	});
	const input = target(gpu, {
		size: [samples.length + ramp.length, 1],
		format: "rgba16float",
	});
	const data = gpu.device.createBuffer({
		size: input.size[0] * 16,
		usage: ["storage", "copy_dst"],
	});
	data.write(new Float32Array([...samples, ...ramp].flat()));
	const fill = effect(
		gpu,
		`
    @group(0) @binding(0) var<storage, read> samples: array<vec4f>;
    @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
      return samples[u32(p.x)];
    }
  `,
		{ set: { samples: data } },
	);
	const graph = createRenderGraph(gpu);
	const uniform = (channel: keyof ColorMixer, value: number): ColorMixer => ({
		...defaultMixer,
		[channel]: colors.map(() => value),
	});
	const selected = (
		index: number,
		channel: keyof ColorMixer,
		value: number,
	): ColorMixer => ({
		...defaultMixer,
		[channel]: colors.map((_, i) => (i === index ? value : 0)),
	});
	try {
		frame(gpu, (f) => f.pass(input, fill));
		await gpu.gpu.queue.onSubmittedWorkDone();
		const original = [...(await input.readFloats())];
		const outputs = [];
		for (const settings of [
			defaultMixer,
			uniform("hue", 100),
			uniform("hue", -100),
			uniform("saturation", -100),
			uniform("luminance", 100),
			uniform("luminance", -100),
			selected(5, "saturation", -100),
			selected(0, "hue", 100),
		]) {
			const [output] = graph.render([
				pipeline(inputNode(input), [colorMixer(settings)]),
			]);
			outputs.push([...(await output.readFloats())]);
		}
		return { original, outputs, sampleCount: samples.length };
	} finally {
		graph.dispose();
		input.color.dispose();
		data.dispose();
		gpu.dispose();
	}
}
