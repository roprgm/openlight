import { clamp } from "@/lib/math";

type Size = readonly [number, number, ...number[]];

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

export function orientedSize(size: Size, rotation: number): [number, number] {
	return rotation % 180 ? [size[1], size[0]] : [size[0], size[1]];
}

export function cropSize(size: Size, geometry: Geometry): [number, number] {
	const [width, height] = orientedSize(size, geometry.rotation);
	return [
		Math.max(1, Math.round(width * geometry.width)),
		Math.max(1, Math.round(height * geometry.height)),
	];
}

/** One affine map from the crop frame to the source, including the area outside it. */
export function cropTransform(crop: Geometry, size: Size) {
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

function sourceBounds(crop: Geometry, size: Size) {
	const { origin, xAxis, yAxis } = cropTransform(crop, size);
	return origin.map((value, axis) => [
		value + Math.min(0, xAxis[axis]) + Math.min(0, yAxis[axis]),
		value + Math.max(0, xAxis[axis]) + Math.max(0, yAxis[axis]),
	]);
}

/** Translation slides along reached edges instead of stopping both axes. */
function constrainMove(crop: Geometry, size: Size) {
	const correction = sourceBounds(crop, size).map(([min, max], axis) => {
		const overflow = Math.max(0, -min) + Math.min(0, 1 - max);
		return overflow * size[axis];
	});
	const [x, y] = rotate(correction[0], correction[1], crop.rotation);
	const [width, height] = orientedSize(size, crop.rotation);
	return { ...crop, x: crop.x + x / width, y: crop.y + y / height };
}

/** Stop the whole resize at its first source edge to preserve the anchor and aspect. */
function constrainResize(previous: Geometry, next: Geometry, size: Size) {
	const start = sourceBounds(previous, size).flat();
	const end = sourceBounds(next, size).flat();
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

/** Minimum magnification that keeps the rotated frame covered around its source center. */
function rotationScale(crop: Geometry, size: Size) {
	const scales = sourceBounds({ ...crop, scale: 1 }, size).map(([min, max]) => {
		const center = (min + max) / 2;
		const room = Math.max(0, Math.min(center, 1 - center));
		return (max - min) / (2 * room);
	});
	return Math.max(1, ...scales);
}

function validateGeometry(crop: Geometry, size: Size) {
	const { flipX, flipY, ...numeric } = crop;
	const finite = Object.values(numeric).every(Number.isFinite);
	const flips = typeof flipX === "boolean" && typeof flipY === "boolean";
	const dimensions = crop.width > 0 && crop.height > 0 && crop.scale >= 1;
	const rotation =
		[0, 90, 180, 270].includes(crop.rotation) && Math.abs(crop.angle) <= 45;
	if (!finite || !flips || !dimensions || !rotation) {
		throw new Error("Invalid crop or rotation.");
	}
	const outside = sourceBounds(crop, size)
		.flat()
		.some((value) => value < -1e-9 || value > 1 + 1e-9);
	if (outside) {
		throw new Error("Invalid crop: outside the image.");
	}
}

export function changeGeometry(
	geometry: Geometry,
	change: Partial<Geometry>,
	size: Size,
): Geometry {
	const next = { ...geometry, ...change };
	const needsScale = change.angle !== undefined && change.scale === undefined;
	const result = {
		...next,
		scale: needsScale ? rotationScale(next, size) : next.scale,
	};
	validateGeometry(result, size);
	return result;
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

/** Convert an on-screen displacement to the oriented source coordinates. */
function sourceOffset(crop: Geometry, dx: number, dy: number, size: Size) {
	const [width, height] = orientedSize(size, crop.rotation);
	const [x, y] = rotate(
		dx * width * (crop.flipX ? -1 : 1),
		dy * height * (crop.flipY ? -1 : 1),
		-crop.angle,
	);
	return [x / width / crop.scale, y / height / crop.scale];
}

export function moveCrop(
	crop: Geometry,
	dx: number,
	dy: number,
	size: Size,
): Geometry {
	const [x, y] = sourceOffset(crop, dx, dy, size);
	return constrainMove({ ...crop, x: crop.x + x, y: crop.y + y }, size);
}

function resizeDimensions(width: number, height: number, ratio: number | null) {
	if (!ratio) {
		return [Math.max(0.01, width), Math.max(0.01, height)];
	}
	// Project the pointer onto the aspect diagonal, so changing direction stays continuous.
	const projection = (width * ratio + height) / (ratio * ratio + 1);
	const lockedWidth = Math.max(0.01, projection * ratio);
	return [lockedWidth, lockedWidth / ratio];
}

export function resizeCrop(
	crop: Geometry,
	handle: string,
	dx: number,
	dy: number,
	ratio: number | null,
	size: Size,
): Geometry {
	const directionX = handle.includes("w") ? -1 : 1;
	const directionY = handle.includes("n") ? -1 : 1;
	const [width, height] = resizeDimensions(
		crop.width + directionX * dx,
		crop.height + directionY * dy,
		ratio,
	);
	const [x, y] = sourceOffset(
		crop,
		((width - crop.width) * directionX) / 2,
		((height - crop.height) * directionY) / 2,
		size,
	);
	return constrainResize(
		crop,
		{
			...crop,
			x: crop.x + (crop.width - width) / 2 + x,
			y: crop.y + (crop.height - height) / 2 + y,
			width,
			height,
		},
		size,
	);
}
