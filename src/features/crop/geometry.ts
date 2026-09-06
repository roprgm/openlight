import { clamp } from "@/lib/math";

export type Rect = { x: number; y: number; width: number; height: number };
// The rectangle's center is a source point; its dimensions describe the output frame.
export type Geometry = Rect & {
	rotation: number; // Clockwise quarter turns, in degrees.
	angle: number; // Fine rotation around the crop center, in degrees.
	flipX: boolean;
	flipY: boolean;
	scale: number; // Source magnification needed to cover the rotated frame.
};
export type CropDraft = { geometry: Geometry; aspect: number | null };
export const defaultGeometry: Geometry = {
	x: 0,
	y: 0,
	width: 1,
	height: 1,
	rotation: 0,
	angle: 0,
	flipX: false,
	flipY: false,
	scale: 1,
};

function rotate(x: number, y: number, degrees: number) {
	const angle = (degrees * Math.PI) / 180;
	return [
		Math.cos(angle) * x - Math.sin(angle) * y,
		Math.sin(angle) * x + Math.cos(angle) * y,
	];
}

export function orientedSize(
	size: readonly number[],
	rotation: number,
): [number, number] {
	return rotation % 180 ? [size[1], size[0]] : [size[0], size[1]];
}

export function cropSize(
	size: readonly number[],
	geometry: Geometry,
): [number, number] {
	const [width, height] = orientedSize(size, geometry.rotation);
	return [
		Math.max(1, Math.round(width * geometry.width)),
		Math.max(1, Math.round(height * geometry.height)),
	];
}

/** One affine map from the crop frame to the source, including the area outside it. */
export function cropTransform(crop: Geometry, size: readonly number[]) {
	const [width, height] = orientedSize(size, crop.rotation);
	const center = rotate(
		(crop.x + crop.width / 2 - 0.5) * width,
		(crop.y + crop.height / 2 - 0.5) * height,
		-crop.rotation,
	);
	const xAxis = rotate(
		(crop.width * width * (crop.flipX ? -1 : 1)) / crop.scale,
		0,
		-crop.rotation - crop.angle,
	).map((v, i) => v / size[i]);
	const yAxis = rotate(
		0,
		(crop.height * height * (crop.flipY ? -1 : 1)) / crop.scale,
		-crop.rotation - crop.angle,
	).map((v, i) => v / size[i]);
	return {
		origin: center.map((v, i) => v / size[i] + 0.5 - (xAxis[i] + yAxis[i]) / 2),
		xAxis,
		yAxis,
	};
}

function sourceCorners(crop: Geometry, size: readonly number[]) {
	const { origin, xAxis, yAxis } = cropTransform(crop, size);
	return [0, 1].flatMap((x) =>
		[0, 1].map((y) => origin.map((v, i) => v + x * xAxis[i] + y * yAxis[i])),
	);
}

/** Translation slides along reached edges instead of stopping both axes. */
function constrainMove(crop: Geometry, size: readonly number[]) {
	const corners = sourceCorners(crop, size);
	const correction = [0, 1].map((axis) => {
		const values = corners.map((point) => point[axis]);
		const overflow =
			Math.max(0, -Math.min(...values)) + Math.min(0, 1 - Math.max(...values));
		return overflow * size[axis];
	});
	const [x, y] = rotate(correction[0], correction[1], crop.rotation);
	const [width, height] = orientedSize(size, crop.rotation);
	return { ...crop, x: crop.x + x / width, y: crop.y + y / height };
}

/** Stop the whole resize at its first source edge to preserve the anchor and aspect. */
function constrainResize(
	previous: Geometry,
	next: Geometry,
	size: readonly number[],
) {
	const start = sourceCorners(previous, size).flat();
	const end = sourceCorners(next, size).flat();
	let fraction = 1;
	for (const [i, value] of end.entries()) {
		if (value < -1e-9 || value > 1 + 1e-9) {
			fraction = Math.min(
				fraction,
				clamp((clamp(value) - start[i]) / (value - start[i])),
			);
		}
	}
	if (fraction === 1) {
		return next;
	}
	return {
		...next,
		x: previous.x + (next.x - previous.x) * fraction,
		y: previous.y + (next.y - previous.y) * fraction,
		width: previous.width + (next.width - previous.width) * fraction,
		height: previous.height + (next.height - previous.height) * fraction,
	};
}

export function changeGeometry(
	geometry: Geometry,
	change: Partial<Geometry>,
	size: readonly number[],
): Geometry {
	const next = { ...geometry, ...change };
	const { flipX, flipY, ...numeric } = next;
	if (
		Object.values(numeric).some((v) => !Number.isFinite(v)) ||
		typeof flipX !== "boolean" ||
		typeof flipY !== "boolean" ||
		next.width <= 0 ||
		next.height <= 0 ||
		![0, 90, 180, 270].includes(next.rotation) ||
		Math.abs(next.angle) > 45 ||
		next.scale < 1
	) {
		throw new Error("Invalid crop or rotation.");
	}
	if (change.angle !== undefined && change.scale === undefined) {
		const { origin, xAxis, yAxis } = cropTransform({ ...next, scale: 1 }, size);
		const scales = origin.map((v, i) => {
			const center = v + (xAxis[i] + yAxis[i]) / 2;
			const room = Math.min(center, 1 - center);
			if (room <= 0) {
				throw new Error("Crop center is outside the image.");
			}
			return (Math.abs(xAxis[i]) + Math.abs(yAxis[i])) / (2 * room);
		});
		return { ...next, scale: Math.max(1, ...scales) };
	}
	if (
		sourceCorners(next, size)
			.flat()
			.some((v) => v < -1e-9 || v > 1 + 1e-9)
	) {
		throw new Error("Invalid crop: outside the image.");
	}
	return next;
}

export function rotateCrop(crop: Geometry, direction: -1 | 1 = 1): Geometry {
	return {
		...crop,
		x: direction === 1 ? 1 - crop.y - crop.height : crop.y,
		y: direction === 1 ? crop.x : 1 - crop.x - crop.width,
		width: crop.height,
		height: crop.width,
		rotation: (crop.rotation + direction * 90 + 360) % 360,
		flipX: crop.flipY,
		flipY: crop.flipX,
	};
}

export function flipCrop(
	crop: Geometry,
	axis: "horizontal" | "vertical",
): Geometry {
	const key = axis === "horizontal" ? "flipX" : "flipY";
	return { ...crop, [key]: !crop[key] };
}

export function fitAspect(rect: Rect, ratio: number): Rect {
	const width = Math.min(rect.width, rect.height * ratio);
	const height = width / ratio;
	return {
		x: rect.x + (rect.width - width) / 2,
		y: rect.y + (rect.height - height) / 2,
		width,
		height,
	};
}

/** Deltas are in oriented-image units. Resizing anchors the opposite source corner. */
export function dragCrop(
	crop: Geometry,
	handle: string,
	dx: number,
	dy: number,
	ratio: number | null,
	size: readonly number[],
): Geometry {
	const [imageWidth, imageHeight] = orientedSize(size, crop.rotation);
	const directionX = handle.includes("w") ? -1 : 1;
	const directionY = handle.includes("n") ? -1 : 1;
	let width = crop.width;
	let height = crop.height;
	if (handle !== "move") {
		const proposedWidth = crop.width + directionX * dx;
		const proposedHeight = crop.height + directionY * dy;
		width = Math.max(
			0.01,
			ratio
				? ((proposedWidth * ratio + proposedHeight) * ratio) /
						(ratio * ratio + 1)
				: proposedWidth,
		);
		height = ratio ? width / ratio : Math.max(0.01, proposedHeight);
	}
	const offsetX =
		handle === "move" ? dx : ((width - crop.width) * directionX) / 2;
	const offsetY =
		handle === "move" ? dy : ((height - crop.height) * directionY) / 2;
	const shift = rotate(
		offsetX * imageWidth * (crop.flipX ? -1 : 1),
		offsetY * imageHeight * (crop.flipY ? -1 : 1),
		-crop.angle,
	);
	const next = {
		...crop,
		x: crop.x + (crop.width - width) / 2 + shift[0] / imageWidth / crop.scale,
		y:
			crop.y + (crop.height - height) / 2 + shift[1] / imageHeight / crop.scale,
		width,
		height,
	};
	return handle === "move"
		? constrainMove(next, size)
		: constrainResize(crop, next, size);
}
