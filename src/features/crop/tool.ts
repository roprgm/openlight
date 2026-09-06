import { createStore } from "zustand/vanilla";
import {
	type CropDraft,
	changeGeometry,
	cropSize,
	defaultGeometry,
	type Geometry,
} from "./geometry";

/** Imperative crop draft. Source pixels and committed edits belong to the caller. */
export function createCropTool(
	sourceSize: () => readonly [number, number, ...number[]],
	onBegin: () => Geometry,
	commit: (geometry: Geometry) => void,
) {
	const state = createStore<CropDraft | null>(() => null);
	const cancel = () => state.setState(null, true);
	return {
		get size() {
			return sourceSize();
		},
		state,
		cancel,
		begin() {
			const geometry = onBegin();
			const [width, height] = cropSize(sourceSize(), geometry);
			state.setState({ geometry, aspect: width / height }, true);
		},
		change(
			change: Partial<Geometry>,
			aspect = state.getState()?.aspect ?? null,
		) {
			const draft = state.getState();
			if (draft) {
				state.setState(
					{
						geometry: changeGeometry(draft.geometry, change, sourceSize()),
						aspect,
					},
					true,
				);
			}
		},
		apply() {
			const draft = state.getState();
			if (draft) {
				commit(draft.geometry);
			}
			cancel();
		},
		reset() {
			state.setState(
				{
					geometry: defaultGeometry,
					aspect: sourceSize()[0] / sourceSize()[1],
				},
				true,
			);
		},
	};
}
export type CropTool = ReturnType<typeof createCropTool>;
