import type {
	EditorDocument,
	EffectLayer,
	Gradient,
	MaskLayer,
	ProcessingLayer,
} from "@/core/document";
import { defaultAdjustments } from "@/features/adjustments/model";
import { defaultMixer } from "@/features/color-mixer/model";
import { defaultDetails } from "@/features/details/model";
import { defaultCurve } from "@/features/tone-curves/curve";

function baseLayer() {
	return { id: crypto.randomUUID(), visible: true, opacity: 1, children: [] };
}

export function createLayer<K extends EffectLayer["kind"]>(
	kind: K,
): Extract<EffectLayer, { kind: K }>;
export function createLayer(kind: EffectLayer["kind"]): EffectLayer {
	const base = baseLayer();
	switch (kind) {
		case "details":
			return { ...base, kind, name: "Details", details: { ...defaultDetails } };
		case "exposure":
			return { ...base, kind, name: "Exposure", exposure: 1 };
		case "vignette":
			return {
				...base,
				kind,
				name: "Vignette",
				vignette: { intensity: 50, softness: 50 },
			};
		case "curves":
			return { ...base, kind, name: "Curves", toneCurve: defaultCurve };
		case "color-mixer":
			return { ...base, kind, name: "Color Mixer", colorMixer: defaultMixer };
		default:
			throw Error("Unknown layer kind.");
	}
}

export function createMask(
	mask: Gradient,
	operation: MaskLayer["operation"] = "add",
): MaskLayer {
	return {
		...baseLayer(),
		kind: "mask",
		name: mask.kind === "radial" ? "Radial Gradient" : "Linear Gradient",
		operation,
		adjustments: { ...defaultAdjustments },
		mask,
	};
}

/** Convenience commands address the first root effect of a kind or create one on top of the stack. */
export function editEffect(
	document: EditorDocument,
	kind: ProcessingLayer["kind"],
	id: string | undefined,
	edit: (id: string) => void,
	create: () => ProcessingLayer,
) {
	const scene = document.scene.getState();
	const existing = id ?? scene.layers.find((layer) => layer.kind === kind)?.id;
	if (existing) {
		edit(existing);
		return;
	}
	document.edit({ ...scene, layers: [...scene.layers, create()] });
}
