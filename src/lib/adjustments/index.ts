import { node } from "@/core/render/node";
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

export function adjustments(values: Adjustments) {
	return node("adjustments", shader, {
		set: { adjustments: values },
		samplers: { sourceSampler: { minFilter: "linear", magFilter: "linear" } },
	});
}
