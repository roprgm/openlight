import type { Gpu, Target, Timer } from "vgpu";
import type { Scene } from "@/lib/editor/scene";
import type { ImageSource, WhiteBalance } from "@/lib/image-source";
import { createRenderGraph } from "./graph";
import type { RenderImage } from "./node";

/** App composition describes requested outputs; the engine owns their storage. */
export type SceneProcessing = (
	source: Target,
	scene: Scene,
) => {
	original: RenderImage;
	input: RenderImage;
	full: RenderImage;
	output: RenderImage;
};

function sameBalance(a: WhiteBalance | undefined, b: WhiteBalance | undefined) {
	return a?.temperature === b?.temperature && a?.tint === b?.tint;
}

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(
	gpu: Gpu,
	resource: ImageSource,
	processing: SceneProcessing,
	clock?: Timer,
) {
	const source = resource.image;
	const graph = createRenderGraph(gpu, clock);
	const release = resource.retain();
	const raw = resource.raw?.createPass();
	let original = source;
	let input = source;
	let fullImage = source;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = source;
	let balance = resource.raw?.asShot;
	let next: Scene | undefined;
	let pending: Promise<void> | undefined;
	let disposed = false;
	function render(scene: Scene) {
		const images = processing(raw?.render() ?? source, scene);
		[original, input, fullImage, output] = graph.render([
			images.original,
			images.input,
			images.full,
			images.output,
		]);
		rendered = true;
		for (const listener of listeners) {
			listener();
		}
	}
	/** Only calibration crosses the worker; each renderer owns its GPU RAW pass. */
	async function develop() {
		while (next && !disposed) {
			const scene = next;
			next = undefined;
			const selected = scene.whiteBalance ?? resource.raw?.asShot;
			if (raw && selected && !sameBalance(balance, selected)) {
				await raw.prepare(selected);
				if (disposed) {
					return;
				}
				balance = selected;
			}
			if (!next) {
				render(scene);
			}
		}
	}
	async function update(scene: Scene): Promise<void> {
		if (disposed) {
			throw Error("Renderer is closed.");
		}
		if (!resource.raw) {
			render(scene);
			return;
		}
		next = scene;
		pending ??= develop()
			.catch((error) => {
				if (!next) {
					throw error;
				}
			})
			.finally(() => {
				pending = undefined;
				if (next && !disposed) {
					return update(next);
				}
			});
		return pending;
	}

	return {
		originalImage: () => original,
		inputImage: () => input,
		fullImage: () => fullImage,
		outputImage: () => output,
		inspect: graph.inspect,
		subscribe(listener: () => void) {
			listeners.add(listener);
			if (rendered) {
				listener();
			}
			return () => {
				listeners.delete(listener);
			};
		},
		update,
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			listeners.clear();
			graph.dispose();
			raw?.dispose();
			release();
		},
	};
}
