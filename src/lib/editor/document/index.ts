import { createStore } from "zustand/vanilla";
import { shallow } from "zustand/vanilla/shallow";
import type { Scene } from "@/lib/editor/scene";
import { createHistory } from "@/lib/history";
import { frameValues, validateFrame } from "@/lib/image-frame/geometry";
import { validateWhiteBalance } from "@/lib/image-source";
import { createResources } from "./resources";

export type Preview = {
	comparison: "edited" | "original" | "split";
	split: number;
	shadows: boolean;
	highlights: boolean;
};

function equal(a: Scene, b: Scene) {
	return (
		a.source === b.source &&
		shallow(frameValues(a.frame), frameValues(b.frame)) &&
		shallow(a.adjustments, b.adjustments) &&
		shallow(a.whiteBalance, b.whiteBalance) &&
		a.toneCurve.length === b.toneCurve.length &&
		a.toneCurve.every((point, i) => shallow(point, b.toneCurve[i]))
	);
}

/** One independent editing session. No React, decoders, or file workflows. */
export function createDocument(initial: Scene, resources = createResources()) {
	const scene = createStore(() => initial);
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
			if (next.whiteBalance) {
				const profile = resources.get(next.source).whiteBalance;
				if (!profile)
					throw Error("This image does not support absolute white balance.");
				validateWhiteBalance(next.whiteBalance, profile.asShot);
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
