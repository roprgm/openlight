import type { Gpu, Timer } from "vgpu";
import type { Scene } from "@/core/document";
import type { ImageSource, WhiteBalance } from "@/core/image";
import { createRenderGraph } from "./graph";
import { input, type RenderImage } from "./node";

export { type Clipping, createDisplay, type View } from "./display";
export {
	input,
	merge,
	type NodeDefinition,
	node,
	pipeline,
	type RenderImage,
	type RenderInput,
	type RenderNode,
	type RenderStep,
	split,
} from "./node";
export { transformImages } from "./transform";
export { createRenderGraph };

/** App composition describes requested outputs; the engine owns their storage. */
export type SceneProcessing = (
	source: RenderImage,
	scene: Scene,
) => {
	original: RenderImage;
	input: RenderImage;
	full: RenderImage;
	output: RenderImage;
};

type RendererOptions = {
	timer?: Timer;
	prepare?(scene: Scene): void | Promise<void>;
	dispose?(): void;
};

function sameBalance(a: WhiteBalance | undefined, b: WhiteBalance | undefined) {
	return a?.temperature === b?.temperature && a?.tint === b?.tint;
}

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(
	gpu: Gpu,
	resource: ImageSource,
	compose: SceneProcessing,
	options: RendererOptions = {},
) {
	const source = resource.image;
	const graph = createRenderGraph(gpu, options.timer);
	const release = resource.retain();
	const raw = resource.raw?.createPass();
	let original = source;
	let previewInput = source;
	let full = source;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = source;
	let balance = resource.raw?.asShot;
	let next: Scene | undefined;
	let pending: Promise<void> | undefined;
	let disposed = false;
	function render(scene: Scene) {
		const images = compose(input(raw?.render() ?? source), scene);
		[original, previewInput, full, output] = graph.render([
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
	function prepare(scene: Scene): void | Promise<void> {
		const selected = scene.whiteBalance ?? resource.raw?.asShot;
		if (!raw || !selected || sameBalance(balance, selected)) {
			return options.prepare?.(scene);
		}
		return raw.prepare(selected).then(() => {
			if (disposed) {
				return;
			}
			balance = selected;
			if (!next) {
				return options.prepare?.(scene);
			}
		});
	}
	/** Render immediately when ready; coalesce edits during asynchronous preparation. */
	function flush(): void | Promise<void> {
		while (next && !disposed) {
			const scene = next;
			next = undefined;
			const preparation = prepare(scene);
			if (preparation) {
				return preparation.then(() => {
					if (!disposed && !next) {
						render(scene);
					}
					return flush();
				});
			}
			render(scene);
		}
	}
	async function update(scene: Scene): Promise<void> {
		if (disposed) {
			throw Error("Renderer is closed.");
		}
		next = scene;
		if (pending) {
			return pending;
		}
		const preparation = flush();
		if (!preparation && !resource.raw) {
			return;
		}
		pending = (preparation ?? Promise.resolve())
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
		inputImage: () => previewInput,
		fullImage: () => full,
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
			options.dispose?.();
			raw?.dispose();
			release();
		},
	};
}
