import { defaultMixer } from "@/lib/adjustments/mixer";
import type { EditorDocument } from "@/lib/editor/document";
import { setAdjustments } from "@/lib/editor/document/edits";

/** Set one channel's axis: 0 = hue, 1 = saturation, 2 = luminance. */
export function setMixer(
	document: EditorDocument,
	channel: number,
	axis: number,
	value: number,
) {
	const mixer = document.scene
		.getState()
		.adjustments.mixer.map((entry, index) => {
			if (index !== channel) {
				return entry;
			}
			const shifted = [...entry];
			shifted[axis] = value;
			return shifted;
		});
	setAdjustments(document, { mixer });
}

export function resetMixer(document: EditorDocument) {
	setAdjustments(document, { mixer: defaultMixer });
}
