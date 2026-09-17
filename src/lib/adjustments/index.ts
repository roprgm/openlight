import { type RenderImage, renderNode } from "@/core/render/node";
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

export function adjustments(input: RenderImage, values: Adjustments) {
	return renderNode("adjustments", shader, {
		inputs: { source: input },
		set: { adjustments: values },
		samplers: { sourceSampler: { minFilter: "linear", magFilter: "linear" } },
	});
}
