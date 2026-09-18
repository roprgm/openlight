import type { Adjustments } from "@/core/document";
import { node } from "@/core/renderer";
import shader from "./adjustments.wgsl";

export function adjustments(values: Adjustments, name = "adjustments") {
	return node(name, shader, {
		set: { adjustments: values },
		samplers: { sourceSampler: { minFilter: "linear", magFilter: "linear" } },
	});
}
