import { createStore } from "zustand/vanilla";
import { shallow } from "zustand/vanilla/shallow";
import { frameValues, validateFrame } from "@/core/image/frame";
import { createHistory } from "./history";
import { createResources } from "./resources";
import type { Gradient, Layer, Scene } from "./scene";
import { findLayer } from "./tree";

export type {
	Adjustments,
	ColorMixer,
	CurvePoint,
	Details,
	Gradient,
	ImageLayer,
	Layer,
	LinearGradient,
	MaskLayer,
	ProcessingLayer,
	RadialGradient,
	Scene,
	ToneCurve,
	Vignette,
} from "./scene";
export { editLayer, findLayer, walkLayers } from "./tree";
export { createResources };

export type Preview = {
	comparison: "edited" | "original" | "split";
	split: number;
	shadows: boolean;
	highlights: boolean;
};

function equalGradient(a: Gradient, b: Gradient) {
	if (a.kind === "linear" && b.kind === "linear") {
		return shallow(a.start, b.start) && shallow(a.end, b.end);
	}
	return (
		a.kind === "radial" &&
		b.kind === "radial" &&
		shallow(a.center, b.center) &&
		shallow(a.radius, b.radius) &&
		a.angle === b.angle &&
		a.feather === b.feather
	);
}

function equalLayer(a: Layer, b: Layer): boolean {
	if (a === b) {
		return true;
	}
	if (
		a.kind !== b.kind ||
		a.id !== b.id ||
		a.name !== b.name ||
		a.children.length !== b.children.length ||
		!a.children.every((child, index) => equalLayer(child, b.children[index]))
	) {
		return false;
	}
	if (a.kind === "image" && b.kind === "image") {
		return (
			a.source === b.source &&
			shallow(a.adjustments, b.adjustments) &&
			shallow(a.whiteBalance, b.whiteBalance)
		);
	}
	if (
		a.kind === "image" ||
		b.kind === "image" ||
		a.visible !== b.visible ||
		a.opacity !== b.opacity
	) {
		return false;
	}
	if (a.kind === "exposure" && b.kind === "exposure") {
		return a.exposure === b.exposure;
	}
	if (a.kind === "details" && b.kind === "details") {
		return shallow(a.details, b.details);
	}
	if (a.kind === "vignette" && b.kind === "vignette") {
		return shallow(a.vignette, b.vignette);
	}
	if (a.kind === "mask" && b.kind === "mask") {
		return (
			a.operation === b.operation &&
			equalGradient(a.mask, b.mask) &&
			shallow(a.adjustments, b.adjustments)
		);
	}

	if (a.kind === "curves" && b.kind === "curves") {
		return (
			a.toneCurve.length === b.toneCurve.length &&
			a.toneCurve.every((point, index) => shallow(point, b.toneCurve[index]))
		);
	}
	return (
		a.kind === "color-mixer" &&
		b.kind === "color-mixer" &&
		shallow(a.colorMixer.hue, b.colorMixer.hue) &&
		shallow(a.colorMixer.saturation, b.colorMixer.saturation) &&
		shallow(a.colorMixer.luminance, b.colorMixer.luminance)
	);
}

function equal(a: Scene, b: Scene) {
	return (
		a === b ||
		(shallow(frameValues(a.frame), frameValues(b.frame)) &&
			a.layers.length === b.layers.length &&
			a.layers.every((layer, index) => equalLayer(layer, b.layers[index])))
	);
}

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(initial: Scene, resources = createResources()) {
	const scene = createStore(() => initial);
	const selection = createStore(() => ({ layerId: initial.layers[0].id }));
	const { update, ...history } = createHistory(
		scene,
		equal,
		100,
		(retained) => {
			resources.retain(
				new Set(retained.map((state) => state.layers[0].source)),
			);
		},
	);
	const unsubscribe = scene.subscribe((state) => {
		const id = selection.getState().layerId;
		if (!findLayer(state.layers, id)) {
			selection.setState({ layerId: state.layers[0].id });
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
			if (!findLayer(state.layers, layerId)) {
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
