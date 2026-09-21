import type {
	EditorDocument,
	EffectLayer,
	Gradient,
	ImageLayer,
	Layer,
	MaskLayer,
} from "@/core/document";
import type { WhiteBalance } from "@/core/image";
import { defaultAdjustments } from "@/features/adjustments/model";
import { defaultMixer } from "@/features/color-mixer/model";
import { defaultDetails } from "@/features/details/model";
import { defaultCurve } from "@/features/tone-curves/curve";

function baseLayer() {
	return { id: crypto.randomUUID(), visible: true, opacity: 1, children: [] };
}

export function createImageLayer(
	source: string,
	name: string,
	whiteBalance?: WhiteBalance,
): ImageLayer {
	return {
		kind: "image",
		id: crypto.randomUUID(),
		name,
		source,
		whiteBalance,
		adjustments: { ...defaultAdjustments },
		toneCurve: defaultCurve,
		children: [],
	};
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
		toneCurve: defaultCurve,
		mask,
	};
}

/** The first root effect of a kind. */
export function findEffect<K extends EffectLayer["kind"]>(
	layers: readonly Layer[],
	kind: K,
) {
	return layers.find(
		(layer): layer is Extract<EffectLayer, { kind: K }> => layer.kind === kind,
	);
}

/** Convenience commands address the first root effect of a kind or create one on top of the stack as one entry. */
export function editEffect(
	document: EditorDocument,
	kind: EffectLayer["kind"],
	id: string | undefined,
	edit: (id: string) => void,
) {
	const scene = document.scene.getState();
	const existing = id ?? findEffect(scene.layers, kind)?.id;
	if (existing) {
		edit(existing);
		return;
	}
	const layer = createLayer(kind);
	const opened = document.history.begin();
	try {
		document.edit({ ...scene, layers: [...scene.layers, layer] });
		edit(layer.id);
		if (opened) {
			document.history.commit();
		}
	} catch (error) {
		if (opened) {
			document.history.cancel();
		}
		throw error;
	}
}
