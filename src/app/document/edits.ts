import { type Adjustments, adjustmentLimits } from "@/app/scene";
import {
	changeGeometry,
	cropSize,
	defaultGeometry,
	type Geometry,
} from "@/features/crop/geometry";
import {
	defaultCurve,
	type ToneCurve,
	validateCurve,
} from "@/features/tone-curves/curve";
import type { EditorDocument } from "./index";

export function setAdjustments(
	document: EditorDocument,
	change: Partial<Adjustments>,
) {
	for (const [name, value] of Object.entries(change)) {
		const limit = Reflect.get(adjustmentLimits, name);
		if (
			typeof limit !== "number" ||
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			Math.abs(value) > limit
		) {
			throw new Error(`Invalid adjustment: ${name}.`);
		}
	}
	const scene = document.scene.getState();
	document.edit({ ...scene, adjustments: { ...scene.adjustments, ...change } });
}

export function setToneCurve(
	document: EditorDocument,
	points: ToneCurve = defaultCurve,
) {
	validateCurve(points);
	document.edit({
		...document.scene.getState(),
		toneCurve: points.map((point) => ({ ...point })),
	});
}

export function setGeometry(
	document: EditorDocument,
	change: Partial<Geometry> = defaultGeometry,
) {
	const scene = document.scene.getState();
	const { image } = document.resources.get(scene.source);
	const geometry = changeGeometry(scene.geometry, change, image.size);
	document.edit({ ...scene, geometry, size: cropSize(image.size, geometry) });
}
