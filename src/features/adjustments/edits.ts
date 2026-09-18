import {
	type Adjustments,
	type EditorDocument,
	editLayer,
} from "@/core/document";
import {
	adjustmentLimits,
	adjustmentMinimums,
	defaultAdjustments,
} from "./model";

export function setAdjustments(
	document: EditorDocument,
	change: Partial<Adjustments>,
	id = document.scene.getState().layers[0].id,
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
	editLayer(document, id, (layer) => {
		if (layer.kind !== "image" && layer.kind !== "mask") {
			throw Error("Select an image or mask layer.");
		}
		const adjustments = { ...layer.adjustments, ...change };
		if (
			layer.kind === "mask" &&
			(adjustments.clarity !== defaultAdjustments.clarity ||
				adjustments.sharpening !== defaultAdjustments.sharpening ||
				adjustments.sharpenRadius !== defaultAdjustments.sharpenRadius)
		) {
			throw Error("Clarity and sharpening are available on the image layer.");
		}
		return { ...layer, adjustments };
	});
}
