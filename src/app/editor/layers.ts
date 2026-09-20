import type { EditorDocument, ProcessingLayer } from "@/core/document";
import { defaultAdjustments } from "@/features/adjustments/model";
import { defaultMixer } from "@/features/color-mixer/model";
import { defaultDetails } from "@/features/details/model";
import { defaultCurve } from "@/features/tone-curves/curve";

export function createLayer<K extends ProcessingLayer["kind"]>(
	kind: K,
	size: readonly [number, number],
): Extract<ProcessingLayer, { kind: K }>;
export function createLayer(
	kind: ProcessingLayer["kind"],
	size: readonly [number, number],
): ProcessingLayer {
	const base = {
		id: crypto.randomUUID(),
		visible: true,
		opacity: 1,
		children: [],
	};
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
		case "mask":
			return {
				...base,
				kind,
				name: "Linear Gradient",
				operation: "add",
				adjustments: { ...defaultAdjustments },
				mask: {
					kind: "linear",
					start: [size[0] * 0.2, size[1] * 0.5],
					end: [size[0] * 0.8, size[1] * 0.5],
				},
			};
		default:
			throw Error("Unknown layer kind.");
	}
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
