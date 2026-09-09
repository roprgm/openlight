import { type Frame, frame, type Gpu, type Target } from "vgpu";
import { createAdjustments } from "@/lib/adjustments";
import type { Scene } from "@/lib/editor/scene";
import { createImageFrame } from "@/lib/image-frame";
import type { WhiteBalanceSource } from "@/lib/image-source";
import { createPipeline } from "@/lib/pipeline";
import { createToneCurves } from "@/lib/tone-curves";
import { createUnsharpMask } from "@/lib/unsharp-mask";

/** Owns scene passes and intermediate textures for one decoded source. */
export function createRenderer(
	gpu: Gpu,
	source: Target,
	whiteBalance?: WhiteBalanceSource,
) {
	const develop = whiteBalance?.create(gpu);
	const adjust = createAdjustments(gpu, source);
	const adjusted = adjust.output;
	const toneCurves = createToneCurves(gpu, source);
	const clarity = createUnsharpMask(gpu, source, 16);
	const sharpen = createUnsharpMask(gpu, source);
	const pipeline = createPipeline<Scene>(source, [
		...(develop
			? [
					{
						id: "white-balance",
						input: "source",
						dispose: develop.dispose,
						render: (frame: Frame, _input: Target, scene: Scene) =>
							develop.render(frame, scene.whiteBalance),
					},
				]
			: []),
		{
			id: "adjustments",
			input: develop ? "white-balance" : "source",
			dispose: adjust.dispose,
			render: (frame, input, scene) =>
				adjust.render(frame, scene.adjustments, input),
		},
		{
			id: "curves",
			input: "adjustments",
			dispose: toneCurves.dispose,
			render: (frame, input, scene) =>
				toneCurves.render(frame, scene.toneCurve, input),
		},
		{
			id: "clarity",
			input: "curves",
			dispose: clarity.dispose,
			render: (frame, input, scene) =>
				clarity.render(frame, input, scene.adjustments.clarity / 200, 64),
		},
		{
			id: "sharpen",
			input: "clarity",
			dispose: sharpen.dispose,
			// Slider 150 applies a 3× detail gain; radius remains Gaussian sigma.
			render: (frame, input, scene) =>
				sharpen.render(
					frame,
					input,
					scene.adjustments.sharpening / 50,
					scene.adjustments.sharpenRadius,
				),
		},
	]);

	const transform = createImageFrame(gpu);
	let original = source;
	let input = adjusted;
	let fullImage = adjusted;
	const listeners = new Set<() => void>();
	let rendered = false;
	let output = adjusted;
	return {
		stages: pipeline.stages,
		originalImage: () => original,
		inputImage: () => input,
		fullImage: () => fullImage,
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
		update(scene: Scene) {
			frame(gpu, (frame) => {
				fullImage = pipeline.render(frame, scene);
				[original, input, output] = transform.render(
					frame,
					[source, pipeline.output("adjustments"), fullImage],
					scene.frame,
				);
			});
			rendered = true;
			for (const listener of listeners) {
				listener();
			}
		},
		dispose() {
			listeners.clear();
			pipeline.dispose();
			transform.dispose();
		},
	};
}
