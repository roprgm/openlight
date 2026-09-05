import {
	effect,
	type Frame,
	frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import type { EditorDocument } from "@/app/document";
import type { ImageLayer, Scene } from "@/app/scene";
import { createToneCurves } from "@/features/tone-curves/pass";
import type { View } from "@/hooks/use-pan-zoom";
import { createAdjustments } from "@/lib/adjustments";
import compositeShader from "./composite.wgsl";
import shader from "./renderer.wgsl";

/** Reuses intermediate textures while composing the document's image layers. */
export function createRenderer(gpu: Gpu, document: EditorDocument) {
	const { size } = document.scene.getState();
	const options = {
		size,
		format: "rgba16float" as const,
		clearColor: [0, 0, 0, 0] as const,
	};
	const output = target(gpu, options);
	const composite = effect(gpu, compositeShader, { blend: "premultiplied" });
	const adjust = createAdjustments(gpu, options);
	const adjusted = adjust.output;
	const toneCurves = createToneCurves(gpu, adjusted);
	const display = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});

	function prepare(frame: Frame, layer: ImageLayer) {
		const source = document.resources.get(layer.source).image;
		const scale = Math.min(
			size[0] / source.size[0],
			size[1] / source.size[1],
			1,
		);
		adjust.render(
			frame,
			layer.adjustments,
			source,
			source.size.map((value) => value * scale),
		);
	}

	const listeners = new Set<() => void>();
	let rendered = false;
	return {
		inputImage: () => adjusted,
		outputImage: () => output,
		subscribe(listener: () => void) {
			listeners.add(listener);
			if (rendered) {
				listener();
			}
			return () => {
				listeners.delete(listener);
			};
		},
		update(scene: Scene, selectedId = document.selection.getState().layerId) {
			frame(gpu, (frame) => frame.pass(output, () => {}));
			for (const layer of scene.layers) {
				if (!layer.visible || layer.opacity === 0) {
					continue;
				}
				// Submit each layer before reusing the curve buffer for the next one.
				frame(gpu, (frame) => {
					prepare(frame, layer);
					const image = toneCurves.render(frame, layer.toneCurve);
					frame.pass(
						{ target: output, clear: false },
						composite.set({
							above: image.color,
							opacity: layer.opacity,
						}),
					);
				});
			}
			const selected = scene.layers.find((layer) => layer.id === selectedId);
			frame(gpu, (frame) => {
				if (selected) {
					prepare(frame, selected);
				} else {
					frame.pass({ target: adjusted, clear: [0, 0, 0, 0] }, () => {});
				}
			});
			rendered = true;
			for (const listener of listeners) {
				listener();
			}
		},
		draw(
			frame: Frame,
			canvas: Target & { dpr: number },
			view: View,
			background: "checkerboard" | "transparent" | "white" = "checkerboard",
		) {
			if (!rendered) {
				return;
			}
			frame.pass(
				canvas,
				display.set({
					source: output.color,
					params: {
						size: canvas.size,
						sourceSize: output.size,
						pan: view.pan.map((p) => p * canvas.dpr),
						zoom: view.zoom,
						mode: ["checkerboard", "transparent", "white"].indexOf(background),
					},
				}),
			);
		},
		dispose() {
			listeners.clear();
			adjust.dispose();
			toneCurves.dispose();
			output.color.dispose();
		},
	};
}
