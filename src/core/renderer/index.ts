import type { Gpu, Target, Timer } from "vgpu";
import { type Scene, walkLayers } from "@/core/document";
import type { ImageSource, WhiteBalance } from "@/core/image";
import { createRenderGraph } from "./graph";
import { input, type RenderImage } from "./node";

export { mixAdjustment } from "./blend";
export {
	type Clipping,
	createDisplay,
	type MaskOverlay,
	type View,
} from "./display";
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
	inputId?: string,
) => {
	original: RenderImage;
	full: RenderImage;
	output: RenderImage;
	input?: RenderImage;
};

type RenderRequest = {
	scene: Scene;
	inputId?: string;
};

function sameBalance(a: WhiteBalance | undefined, b: WhiteBalance | undefined) {
	return a?.temperature === b?.temperature && a?.tint === b?.tint;
}

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(
	gpu: Gpu,
	resource: ImageSource,
	compose: SceneProcessing,
	timer?: Timer,
) {
	const source = resource.image;
	const graph = createRenderGraph(gpu, timer);
	const release = resource.retain();
	const raw = resource.raw?.createPass();
	let original = source;
	let full = source;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = source;
	let inspected: { id: string; image: Target } | undefined;
	let balance = resource.raw?.asShot;
	let next: RenderRequest | undefined;
	let pending: Promise<void> | undefined;
	let disposed = false;
	let instances = new Set<string>();
	function render({ scene, inputId }: RenderRequest) {
		const active = new Set(walkLayers(scene.layers).map((layer) => layer.id));
		for (const id of instances) {
			if (!active.has(id)) {
				graph.release(`layer/${id}/`);
			}
		}
		instances = active;
		const images = compose(input(raw?.render() ?? source), scene, inputId);
		const targets = graph.render([
			images.original,
			images.full,
			images.output,
			...(images.input ? [images.input] : []),
		]);
		[original, full, output] = targets;
		inspected =
			inputId && targets[3] ? { id: inputId, image: targets[3] } : undefined;
		rendered = true;
		for (const listener of listeners) {
			listener();
		}
	}
	/** Only calibration crosses the worker; each renderer owns its GPU RAW pass. */
	async function develop() {
		while (next && !disposed) {
			const request = next;
			next = undefined;
			const { scene } = request;
			const selected = scene.layers[0].whiteBalance ?? resource.raw?.asShot;
			if (raw && selected && !sameBalance(balance, selected)) {
				await raw.prepare(selected);
				if (disposed) {
					return;
				}
				balance = selected;
			}
			if (!next) {
				render(request);
			}
		}
	}
	async function update(scene: Scene, inputId?: string): Promise<void> {
		if (disposed) {
			throw Error("Renderer is closed.");
		}
		if (!resource.raw) {
			render({ scene, inputId });
			return;
		}
		next = { scene, inputId };
		pending ??= develop()
			.catch((error) => {
				if (!next) {
					throw error;
				}
			})
			.finally(() => {
				pending = undefined;
				if (next && !disposed) {
					return update(next.scene, next.inputId);
				}
			});
		return pending;
	}

	return {
		originalImage: () => original,
		fullImage: () => full,
		outputImage: () => output,
		inputImage: (id: string) =>
			inspected?.id === id ? inspected.image : undefined,
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
