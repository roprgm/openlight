import type { View } from "@/hooks/use-pan-zoom";
import { cropSize, type Geometry, orientedSize, rotateCrop } from "./geometry";

/** Reveal the source around a crop without moving or scaling the visible content. */
export function revealCrop(
	view: View,
	viewport: readonly number[],
	size: readonly number[],
	geometry: Geometry,
	rotation: number,
): View {
	if (!viewport[0] || !viewport[1]) {
		return view;
	}
	let reference = geometry;
	const turns = ((rotation - geometry.rotation + 360) % 360) / 90;
	for (let turn = 0; turn < turns; turn++) {
		reference = rotateCrop(reference);
	}
	const fit = ([width, height]: readonly number[]) =>
		Math.min(viewport[0] / width, viewport[1] / height, 2 / devicePixelRatio);
	const fullSize = orientedSize(size, rotation);
	const scale = fit(cropSize(size, reference)) * view.zoom;
	return {
		zoom: scale / fit(fullSize),
		pan: [
			view.pan[0] +
				(0.5 - reference.x - reference.width / 2) * fullSize[0] * scale,
			view.pan[1] +
				(0.5 - reference.y - reference.height / 2) * fullSize[1] * scale,
		],
	};
}
