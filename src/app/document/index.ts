import { createStore } from "zustand/vanilla";
import { shallow } from "zustand/vanilla/shallow";
import type { ImageLayer, Scene } from "@/app/scene";
import { createHistory } from "@/lib/history";
import { createResources } from "./resources";

function equalLayer(a: ImageLayer, b: ImageLayer) {
	return (
		a === b ||
		(a.id === b.id &&
			a.source === b.source &&
			a.name === b.name &&
			a.visible === b.visible &&
			a.opacity === b.opacity &&
			shallow(a.adjustments, b.adjustments) &&
			a.toneCurve.length === b.toneCurve.length &&
			a.toneCurve.every((point, i) => shallow(point, b.toneCurve[i])))
	);
}

function equal(a: Scene, b: Scene) {
	return (
		shallow(a.size, b.size) &&
		a.layers.length === b.layers.length &&
		a.layers.every((layer, i) => equalLayer(layer, b.layers[i]))
	);
}

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(initial: Scene, resources = createResources()) {
	const scene = createStore(() => initial);
	const selection = createStore(() => ({ layerId: initial.layers.at(-1)?.id }));
	const { update, ...history } = createHistory(
		scene,
		equal,
		100,
		(retained) => {
			resources.retain(
				new Set(
					retained.flatMap((state) =>
						state.layers.map((layer) => layer.source),
					),
				),
			);
		},
	);
	const unsubscribe = scene.subscribe(({ layers }) => {
		if (!layers.some((layer) => layer.id === selection.getState().layerId)) {
			selection.setState({ layerId: layers.at(-1)?.id });
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
		selection: {
			getState: selection.getState,
			getInitialState: selection.getInitialState,
			subscribe: selection.subscribe,
		},
		selectLayer(id: string) {
			if (closed) {
				throw new Error("Document is closed.");
			}
			if (!scene.getState().layers.some((layer) => layer.id === id)) {
				throw new Error("Layer is unavailable.");
			}
			history.commit();
			if (selection.getState().layerId !== id) {
				selection.setState({ layerId: id });
			}
		},
		history,
		resources,
		edit(next: Scene) {
			if (closed) {
				throw new Error("Document is closed.");
			}
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
