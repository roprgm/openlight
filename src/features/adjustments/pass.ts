import type { Adjustments } from "@/core/document";
import { node } from "@/core/renderer";
import shader from "./adjustments.wgsl";
import { exposure } from "./exposure";
import { defaultAdjustments } from "./model";

/** Exposure alone takes the lighter pass; the full shader runs under its own name once another value moves. */
export function adjustments(values: Adjustments, name = "layer") {
	const exposureOnly = Object.entries(values).every(
		([key, value]) =>
			key === "exposure" || value === Reflect.get(defaultAdjustments, key),
	);
	if (exposureOnly) {
		return exposure(`${name}/exposure`, values.exposure);
	}
	return node(`${name}/adjustments`, shader, {
		set: { adjustments: values },
		samplers: { sourceSampler: { minFilter: "linear", magFilter: "linear" } },
	});
}
