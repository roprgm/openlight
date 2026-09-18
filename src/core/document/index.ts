import { createStore } from "zustand/vanilla";
import { shallow } from "zustand/vanilla/shallow";
import { frameValues, validateFrame } from "@/core/image/frame";
import { createHistory } from "./history";
import { createResources } from "./resources";
import type { EffectLayer, ImageLayer, Scene } from "./scene";

export type {
	Adjustments,
	ColorMixer,
	CurvePoint,
	EffectLayer,
	ImageLayer,
	LinearGradient,
	Scene,
	ToneCurve,
	Vignette,
} from "./scene";
export { createResources };

export type Preview = {
	comparison: "edited" | "original" | "split";
	split: number;
	shadows: boolean;
	highlights: boolean;
};

function equalImage(a: ImageLayer, b: ImageLayer) {
	return (
		a === b ||
		(a.id === b.id &&
			a.source === b.source &&
			shallow(a.adjustments, b.adjustments) &&
			shallow(a.whiteBalance, b.whiteBalance) &&
			shallow(a.colorMixer?.hue, b.colorMixer?.hue) &&
			shallow(a.colorMixer?.saturation, b.colorMixer?.saturation) &&
			shallow(a.colorMixer?.luminance, b.colorMixer?.luminance) &&
			a.toneCurve.length === b.toneCurve.length &&
			a.toneCurve.every((point, i) => shallow(point, b.toneCurve[i])))
	);
}

function equalLayer(a: EffectLayer, b: EffectLayer) {
	if (a === b) {
		return true;
	}
	if (
		a.id !== b.id ||
		a.name !== b.name ||
		a.visible !== b.visible ||
		a.opacity !== b.opacity ||
		!shallow(a.mask?.start, b.mask?.start) ||
		!shallow(a.mask?.end, b.mask?.end)
	) {
		return false;
	}
	if (a.kind === "exposure" && b.kind === "exposure") {
		return a.exposure === b.exposure;
	}
	return (
		a.kind === "vignette" &&
		b.kind === "vignette" &&
		shallow(a.vignette, b.vignette)
	);
}

function equal(a: Scene, b: Scene) {
	return (
		a === b ||
		(shallow(frameValues(a.frame), frameValues(b.frame)) &&
			equalImage(a.image, b.image) &&
			a.layers.length === b.layers.length &&
			a.layers.every((layer, index) => equalLayer(layer, b.layers[index])))
	);
}

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(initial: Scene, resources = createResources()) {
	const scene = createStore(() => initial);
	const selection = createStore(() => ({ layerId: initial.image.id }));
	const { update, ...history } = createHistory(
		scene,
		equal,
		100,
		(retained) => {
			resources.retain(new Set(retained.map((state) => state.image.source)));
		},
	);
	const unsubscribe = scene.subscribe((state) => {
		const id = selection.getState().layerId;
		if (
			id !== state.image.id &&
			!state.layers.some((layer) => layer.id === id)
		) {
			selection.setState({ layerId: state.image.id });
		}
	});
	let closed = false;
	return {
		id: crypto.randomUUID(),
		scene: {
			getState: scene.getState,
			getInitialState: scene.getInitialState,
			subscribe: scene.subscribe,
		},
		selection,
		selectLayer(layerId: string) {
			const state = scene.getState();
			if (
				layerId !== state.image.id &&
				!state.layers.some((layer) => layer.id === layerId)
			) {
				throw Error("Layer is unavailable.");
			}
			if (selection.getState().layerId !== layerId) {
				history.commit();
				selection.setState({ layerId });
			}
		},
		preview: createStore<Preview>(() => ({
			comparison: "edited",
			split: 0.5,
			shadows: false,
			highlights: false,
		})),
		history,
		resources,
		edit(next: Scene) {
			if (closed) {
				throw new Error("Document is closed.");
			}
			validateFrame(next.frame);
			update(next);
		},
		dispose() {
			if (closed) {
				return;
			}
			closed = true;
			unsubscribe();
			history.clear();
			resources.dispose();
		},
	};
}

export type EditorDocument = ReturnType<typeof createDocument>;
