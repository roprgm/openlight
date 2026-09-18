import type { Adjustments, EditorDocument } from "@/core/document";
import { adjustmentLimits, adjustmentMinimums } from "./model";

export function setAdjustments(
	document: EditorDocument,
	change: Partial<Adjustments>,
) {
	for (const [name, value] of Object.entries(change)) {
		const limit = Reflect.get(adjustmentLimits, name);
		if (
			typeof limit !== "number" ||
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			value > limit ||
			value < (Reflect.get(adjustmentMinimums, name) ?? -limit)
		) {
			throw new Error(`Invalid adjustment: ${name}.`);
		}
	}
	const scene = document.scene.getState();
	document.edit({ ...scene, adjustments: { ...scene.adjustments, ...change } });
}
