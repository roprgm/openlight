import type { Target } from "vgpu";

export type View = { zoom: number; pan: readonly [number, number] };

export type Clipping = { shadows: boolean; highlights: boolean };
export function displayView(
	canvas: Target & { dpr: number },
	imageSize: readonly number[],
	view: View,
	fitSize: readonly number[],
	clipping?: Clipping,
) {
	return {
		size: canvas.size,
		fitSize: fitSize.map((value) => value * canvas.dpr),
		imageSize,
		pan: view.pan.map((value) => value * canvas.dpr),
		zoom: view.zoom,
		shadows: Number(clipping?.shadows ?? false),
		highlights: Number(clipping?.highlights ?? false),
	};
}
