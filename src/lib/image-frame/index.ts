import { type Effect, effect, type Gpu, sampler } from "vgpu";
import { type RenderImage, renderNode } from "@/engine/render-graph";
import shader from "./frame.wgsl";
import {
	frameTransform,
	frameValues,
	type ImageFrame,
	imageFrame,
} from "./geometry";

/** Equal inputs share a transform node; identity geometry preserves the input. */
export function createImageFrame(gpu: Gpu) {
	const sourceSampler = sampler(gpu, {
		magFilter: "linear",
		minFilter: "linear",
	});
	const passes: Effect[] = [];
	return (sources: readonly RenderImage[], geometry: ImageFrame) => {
		const initial = frameValues(imageFrame(sources[0].size));
		if (frameValues(geometry).every((value, i) => value === initial[i])) {
			return sources;
		}
		const outputs = new Map<RenderImage, RenderImage>();
		return sources.map((input, i) => {
			const existing = outputs.get(input);
			if (existing) {
				return existing;
			}
			passes[i] ??= effect(gpu, shader, {
				set: { sourceSampler },
			});
			const apply = passes[i];
			const output = renderNode(
				`transform/${i}`,
				[input],
				([image]) =>
					apply.set({
						source: image.color,
						transform: frameTransform(geometry, input.size),
					}),
				{
					size: [Math.round(geometry.size[0]), Math.round(geometry.size[1])],
					format: input.format,
				},
			);
			outputs.set(input, output);
			return output;
		});
	};
}
