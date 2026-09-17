import { effect, type Gpu, sampler } from "vgpu";
import { type RenderImage, renderNode } from "@/engine/render-graph";
import shader from "./adjustments.wgsl";

/** UI units: exposure in stops, every other adjustment in -100..100. */
export type Adjustments = {
	exposure: number;
	incrementalTemperature: number;
	incrementalTint: number;
	contrast: number;
	highlights: number;
	shadows: number;
	whites: number;
	blacks: number;
	vibrance: number;
	saturation: number;
};

export function createAdjustments(gpu: Gpu) {
	const apply = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, {
				minFilter: "linear",
				magFilter: "linear",
			}),
		},
	});
	return (input: RenderImage, adjustments: Adjustments) =>
		renderNode("adjustments", [input], ([image]) =>
			apply.set({ adjustments, source: image.color }),
		);
}
