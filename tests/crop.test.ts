import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createDocument } from "@/app/document";
import { setGeometry } from "@/app/document/edits";
import { createResources } from "@/app/document/resources";
import { applyCrop, beginCrop, updateCrop } from "@/app/editor/crop";
import { defaultAdjustments } from "@/app/scene";
import {
	cropTransform,
	dragRect,
	flipCrop,
	type Geometry,
} from "@/features/crop/geometry";
import { defaultCurve } from "@/features/tone-curves/curve";

function expectCovered(geometry: Geometry, size: readonly number[]) {
	const [width, height] = geometry.rotation % 180 ? [size[1], size[0]] : size;
	const radians = (geometry.angle * Math.PI) / 180;
	for (const x of [geometry.x, geometry.x + geometry.width]) {
		for (const y of [geometry.y, geometry.y + geometry.height]) {
			const px = ((x - 0.5) * width) / geometry.scale;
			const py = ((y - 0.5) * height) / geometry.scale;
			const source = [
				(Math.cos(radians) * px + Math.sin(radians) * py) / width +
					0.5 +
					geometry.offsetX,
				(-Math.sin(radians) * px + Math.cos(radians) * py) / height +
					0.5 +
					geometry.offsetY,
			];
			for (const value of source) {
				expect(value).toBeGreaterThanOrEqual(-1e-9);
				expect(value).toBeLessThanOrEqual(1 + 1e-9);
			}
		}
	}
}

test("crop edits stay within the rotated source through resizing, movement, apply, and undo", async () => {
	const gpu = await init();
	const resources = createResources();
	const size = [1200, 800] as const;
	const source = resources.add(
		new File([], "photo.png"),
		target(gpu, { size }),
	);
	const document = createDocument(
		{ size, source, adjustments: defaultAdjustments, toneCurve: defaultCurve },
		resources,
	);
	try {
		for (const rotation of [0, 90, 180, 270]) {
			for (const angle of [-45, -30, 30, 45]) {
				setGeometry(document);
				setGeometry(document, {
					x: 0.15,
					y: 0.2,
					width: 0.5,
					height: 0.5,
					rotation,
					angle,
					flipX: rotation % 180 !== 0,
					flipY: angle < 0,
				});
				const before = document.scene.getState().geometry;
				for (const axis of ["horizontal", "vertical"] as const) {
					const flipped = flipCrop(before, axis, size);
					setGeometry(document, flipped);
					expectCovered(flipped, size);
					const original = cropTransform(before, size);
					const actual = cropTransform(flipped, size);
					for (const x of [0, 0.3, 1]) {
						for (const y of [0, 0.7, 1]) {
							const u = axis === "horizontal" ? 1 - x : x;
							const v = axis === "vertical" ? 1 - y : y;
							for (const i of [0, 1]) {
								expect(
									actual.origin[i] + x * actual.xAxis[i] + y * actual.yAxis[i],
								).toBeCloseTo(
									original.origin[i] +
										u * original.xAxis[i] +
										v * original.yAxis[i],
									10,
								);
							}
						}
					}
					setGeometry(document, before);
				}
				for (const handle of ["nw", "ne", "sw", "se", "move"]) {
					for (const delta of [-1, 1]) {
						const ratio = delta < 0 ? before.width / before.height : null;
						beginCrop(document);
						updateCrop(document, dragRect(before, handle, delta, delta, ratio));
						const next = document.preview.getState().crop?.geometry;
						if (!next) throw new Error("Missing crop draft.");
						expectCovered(next, size);
						if (ratio && handle !== "move") {
							expect(next.width / next.height).toBeCloseTo(ratio, 8);
							const right = handle.includes("w") ? 1 : 0;
							const bottom = handle.includes("n") ? 1 : 0;
							expect(next.x + right * next.width).toBeCloseTo(
								before.x + right * before.width,
								8,
							);
							expect(next.y + bottom * next.height).toBeCloseTo(
								before.y + bottom * before.height,
								8,
							);
						}
						expect([next.scale, next.offsetX, next.offsetY]).toEqual([
							before.scale,
							before.offsetX,
							before.offsetY,
						]);
						updateCrop(document, { angle: -angle });
						applyCrop(document);
						expectCovered(document.scene.getState().geometry, size);
						if (document.scene.getState().geometry !== before)
							document.history.undo();
						expect(document.scene.getState().geometry).toEqual(before);
					}
				}
			}
		}
	} finally {
		document.dispose();
		gpu.dispose();
	}
});
