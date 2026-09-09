import type { Frame, Target } from "vgpu";

/** A processing stage owns its resources and names the image it consumes. */
export type ImageStage<Settings> = {
	readonly id: string;
	readonly input: string;
	render(frame: Frame, input: Target, settings: Settings): Target;
	dispose(): void;
};

/** Explicit, ordered image dependencies. Source ownership and GPU submission stay with the caller. */
export function createPipeline<Settings>(
	source: Target,
	stages: readonly ImageStage<Settings>[],
) {
	const ids = new Set(["source"]);
	for (const stage of stages) {
		if (ids.has(stage.id) || !ids.has(stage.input))
			throw Error(`Invalid pipeline dependency: ${stage.id} ← ${stage.input}.`);
		ids.add(stage.id);
	}
	const images = new Map<string, Target>([["source", source]]);
	let disposed = false;
	function output(id: string) {
		if (disposed) throw Error("Pipeline is disposed.");
		const image = images.get(id);
		if (!image) throw Error(`Pipeline output is unavailable: ${id}.`);
		return image;
	}
	return {
		stages: stages.map(({ id, input }) => ({ id, input })),
		output,
		render(frame: Frame, settings: Settings) {
			if (disposed) throw Error("Pipeline is disposed.");
			let result = source;
			for (const stage of stages) {
				result = stage.render(frame, output(stage.input), settings);
				images.set(stage.id, result);
			}
			return result;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			for (const stage of [...stages].reverse()) stage.dispose();
			images.clear();
		},
	};
}
