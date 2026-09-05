import { createStore } from "zustand/vanilla";
import { shallow } from "zustand/vanilla/shallow";
import type { Scene } from "@/app/scene";
import { defaultGeometry, type Geometry } from "@/features/crop/geometry";
import { createHistory } from "@/lib/history";
import { createResources } from "./resources";

export type Preview = {
	crop: { geometry: Geometry; aspect: number | null } | null;
	comparison: "edited" | "original" | "split";
	split: number;
	shadows: boolean;
	highlights: boolean;
};

function equal(a: Scene, b: Scene) {
	return (
		a.source === b.source &&
		shallow(a.size, b.size) &&
		shallow(a.geometry, b.geometry) &&
		shallow(a.adjustments, b.adjustments) &&
		a.toneCurve.length === b.toneCurve.length &&
		a.toneCurve.every((point, i) => shallow(point, b.toneCurve[i]))
	);
}

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(
	initial: Omit<Scene, "geometry"> & { geometry?: Geometry },
	resources = createResources(),
) {
	const scene = createStore<Scene>(() => ({
		...initial,
		geometry: { ...defaultGeometry, ...initial.geometry },
	}));
	const { update, ...history } = createHistory(
		scene,
		equal,
		100,
		(retained) => {
			resources.retain(new Set(retained.map((state) => state.source)));
		},
	);
	let closed = false;
	return {
		id: crypto.randomUUID(),
		scene: {
			getState: scene.getState,
			getInitialState: scene.getInitialState,
			subscribe: scene.subscribe,
		},
		preview: createStore<Preview>(() => ({
			crop: null,
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
			update(next);
		},
		dispose() {
			if (closed) {
				return;
			}
			closed = true;
			history.clear();
			resources.dispose();
		},
	};
}

export type EditorDocument = ReturnType<typeof createDocument>;
