import { effect, type Frame, type Gpu, sampler, type Target } from "vgpu";
import {
	frameTransform,
	type ImageFrame,
	imageFrame,
} from "@/lib/image-frame/geometry";
import shader from "./image.wgsl";

export type View = { zoom: number; pan: readonly [number, number] };
export type Clipping = { shadows: boolean; highlights: boolean };
type DisplayOptions = {
	view: View;
	viewport?: readonly number[];
	frame?: ImageFrame;
	original?: Target;
	split?: number;
	clipping?: Clipping;
};

/** Display any transformed image with optional comparison and clipping indicators. */
export function createDisplay(gpu: Gpu) {
	const draw = effect(gpu, shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});
	return (
		frame: Frame,
		canvas: Target & { dpr: number },
		image: Target,
		options: DisplayOptions,
	) => {
		const geometry = options.frame ?? imageFrame(image.size);
		const viewport =
			options.viewport ?? canvas.size.map((value) => value / canvas.dpr);
		frame.pass(
			canvas,
			draw.set({
				source: image.color,
				original: (options.original ?? image).color,
				transform: frameTransform(geometry, image.size),
				split: options.split ?? -1,
				view: {
					size: canvas.size,
					fitSize: viewport.map((value) => value * canvas.dpr),
					imageSize: geometry.size,
					pan: options.view.pan.map((value) => value * canvas.dpr),
					zoom: options.view.zoom,
					shadows: Number(options.clipping?.shadows ?? false),
					highlights: Number(options.clipping?.highlights ?? false),
				},
			}),
		);
	};
}
