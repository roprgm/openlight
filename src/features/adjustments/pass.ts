import type { Adjustments } from "@/core/document";
import { node } from "@/core/renderer";
import shader from "./adjustments.wgsl";

export function adjustments(values: Adjustments) {
	return node("adjustments", shader, {
		set: { adjustments: values },
		samplers: { sourceSampler: { minFilter: "linear", magFilter: "linear" } },
	});
}
