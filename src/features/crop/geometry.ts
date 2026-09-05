export type Rect = { x: number; y: number; width: number; height: number };
export type Geometry = Rect & {
	rotation: number;
	angle: number;
	flipX: boolean;
	flipY: boolean;
	// Keep the image transform independent of subsequent crop-frame edits.
	scale: number;
	offsetX: number;
	offsetY: number;
};
export type CropDraft = { geometry: Geometry; aspect: number | null };
export const fullRect: Rect = { x: 0, y: 0, width: 1, height: 1 };
export const defaultGeometry: Geometry = {
	...fullRect,
	rotation: 0,
	angle: 0,
	flipX: false,
	flipY: false,
	scale: 1,
	offsetX: 0,
	offsetY: 0,
};

export function orientedSize(
	size: readonly number[],
	rotation: number,
): [number, number] {
	return rotation % 180 === 0 ? [size[0], size[1]] : [size[1], size[0]];
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

export function rotateCrop(
	geometry: Geometry,
	direction: -1 | 1 = 1,
): Geometry {
	return {
		...geometry,
		x:
			direction === 1
				? Math.max(0, 1 - geometry.y - geometry.height)
				: geometry.y,
		y:
			direction === 1
				? geometry.x
				: Math.max(0, 1 - geometry.x - geometry.width),
		width: geometry.height,
		height: geometry.width,
		rotation: (geometry.rotation + direction * 90 + 360) % 360,
		offsetX: -direction * geometry.offsetY,
		offsetY: direction * geometry.offsetX,
	};
}

function validateGeometry(geometry: Geometry) {
	const { flipX, flipY, ...numeric } = geometry;
	const { x, y, width, height, rotation, angle, scale } = numeric;
	if (
		Object.values(numeric).some((value) => !Number.isFinite(value)) ||
		typeof flipX !== "boolean" ||
		typeof flipY !== "boolean" ||
		x < 0 ||
		y < 0 ||
		width <= 0 ||
		height <= 0 ||
		x + width > 1.000001 ||
		y + height > 1.000001 ||
		![0, 90, 180, 270].includes(rotation) ||
		Math.abs(angle) > 45 ||
		scale < 1
	) {
		throw new Error("Invalid crop or rotation.");
	}
}

function rotatePoint(x: number, y: number, degrees: number) {
	const angle = (degrees * Math.PI) / 180;
	return [
		Math.cos(angle) * x - Math.sin(angle) * y,
		Math.sin(angle) * x + Math.cos(angle) * y,
	];
}

/** Mirror the image around the crop center without moving the frame. */
export function flipCrop(
	geometry: Geometry,
	axis: "horizontal" | "vertical",
	size: readonly number[],
): Geometry {
	const horizontal = axis === "horizontal";
	const [width, height] = orientedSize(size, geometry.rotation);
	const shift = rotatePoint(
		horizontal ? (2 * geometry.x + geometry.width - 1) * width : 0,
		horizontal ? 0 : (2 * geometry.y + geometry.height - 1) * height,
		-geometry.angle,
	);
	const sourceAxis =
		horizontal === (geometry.rotation % 180 === 0) ? "flipX" : "flipY";
	return {
		...geometry,
		[sourceAxis]: !geometry[sourceAxis],
		angle: -geometry.angle,
		offsetX:
			(geometry.offsetX + shift[0] / width / geometry.scale) *
			(horizontal ? -1 : 1),
		offsetY:
			(geometry.offsetY + shift[1] / height / geometry.scale) *
			(horizontal ? 1 : -1),
	};
}

/** Map crop coordinates into the original texture, shared by preview and output. */
export function cropTransform(geometry: Geometry, size: readonly number[]) {
	const [width, height] = orientedSize(size, geometry.rotation);
	const offset = rotatePoint(
		geometry.offsetX * width,
		geometry.offsetY * height,
		-geometry.rotation,
	);
	const direction = [geometry.flipX ? -1 : 1, geometry.flipY ? -1 : 1];
	function point(x: number, y: number) {
		return rotatePoint(
			(x - 0.5) * width,
			(y - 0.5) * height,
			-geometry.rotation - geometry.angle,
		).map(
			(value, i) =>
				(direction[i] * (value / geometry.scale + offset[i])) / size[i] + 0.5,
		);
	}
	const origin = point(geometry.x, geometry.y);
	return {
		origin,
		xAxis: point(geometry.x + geometry.width, geometry.y).map(
			(v, i) => v - origin[i],
		),
		yAxis: point(geometry.x, geometry.y + geometry.height).map(
			(v, i) => v - origin[i],
		),
	};
}

function sourceCornerCoordinates(geometry: Geometry, size: readonly number[]) {
	const { origin, xAxis, yAxis } = cropTransform(geometry, size);
	return [0, 1].flatMap((x) =>
		[0, 1].flatMap((y) =>
			origin.map((v, i) => v + x * xAxis[i] + y * yAxis[i]),
		),
	);
}

/** Stop a frame edit at the first source edge, preserving its anchor and aspect. */
function constrainCrop(
	previous: Geometry,
	next: Geometry,
	size: readonly number[],
) {
	const corners = sourceCornerCoordinates(next, size);
	if (corners.every((value) => value >= -1e-9 && value <= 1 + 1e-9)) {
		return next;
	}
	if (
		previous.rotation !== next.rotation ||
		previous.angle !== next.angle ||
		previous.scale !== next.scale ||
		previous.offsetX !== next.offsetX ||
		previous.offsetY !== next.offsetY
	) {
		throw new Error("Crop extends outside the image.");
	}
	const start = sourceCornerCoordinates(previous, size);
	let fraction = 1;
	for (const [i, value] of corners.entries()) {
		if (value < 0 || value > 1) {
			const edge = Math.min(1, Math.max(0, value));
			fraction = Math.min(
				fraction,
				Math.max(0, (edge - start[i]) / (value - start[i])),
			);
		}
	}
	return {
		...next,
		x: previous.x + (next.x - previous.x) * fraction,
		y: previous.y + (next.y - previous.y) * fraction,
		width: previous.width + (next.width - previous.width) * fraction,
		height: previous.height + (next.height - previous.height) * fraction,
	};
}

/** Turn around the crop's current source point, fitting its corners inside the image. */
function straighten(
	geometry: Geometry,
	angle: number,
	size: readonly number[],
): Geometry {
	const [width, height] = orientedSize(size, geometry.rotation);
	const x = geometry.x + geometry.width / 2 - 0.5;
	const y = geometry.y + geometry.height / 2 - 0.5;
	const inverse = (degrees: number) =>
		rotatePoint(x * width, y * height, -degrees).map(
			(value, i) => value / [width, height][i],
		);
	const previous = inverse(geometry.angle);
	const center = [
		previous[0] / geometry.scale + geometry.offsetX + 0.5,
		previous[1] / geometry.scale + geometry.offsetY + 0.5,
	];
	const radians = (angle * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.abs(Math.sin(radians));
	const extentX =
		(cosine * geometry.width + (sine * geometry.height * height) / width) / 2;
	const extentY =
		((sine * geometry.width * width) / height + cosine * geometry.height) / 2;
	const room = (value: number) =>
		Math.max(0.000001, Math.min(value, 1 - value));
	const scale = Math.max(
		1,
		extentX / room(center[0]),
		extentY / room(center[1]),
	);
	const next = inverse(angle);
	return {
		...geometry,
		angle,
		scale,
		offsetX: center[0] - 0.5 - next[0] / scale,
		offsetY: center[1] - 0.5 - next[1] / scale,
	};
}

export function changeGeometry(
	geometry: Geometry,
	change: Partial<Geometry>,
	size: readonly number[],
): Geometry {
	const next = { ...geometry, ...change };
	validateGeometry(next);
	if (change.angle !== undefined && change.scale === undefined) {
		return straighten({ ...next, angle: geometry.angle }, change.angle, size);
	}
	return constrainCrop(geometry, next, size);
}

/** Fit a pixel aspect ratio inside the current rectangle without moving its center. */
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

/** Drag a corner around its opposite anchor, or move the entire selection. */
export function dragRect(
	rect: Rect,
	handle: string,
	dx: number,
	dy: number,
	ratio: number | null,
): Rect {
	const clamp = (value: number, low: number, high: number) =>
		Math.min(high, Math.max(low, value));
	if (handle === "move") {
		return {
			...rect,
			x: clamp(rect.x + dx, 0, 1 - rect.width),
			y: clamp(rect.y + dy, 0, 1 - rect.height),
		};
	}
	const left = handle.includes("w");
	const top = handle.includes("n");
	const anchorX = rect.x + (left ? rect.width : 0);
	const anchorY = rect.y + (top ? rect.height : 0);
	const maxWidth = left ? anchorX : 1 - anchorX;
	const maxHeight = top ? anchorY : 1 - anchorY;
	const draggedWidth = rect.width + (left ? -dx : dx);
	const draggedHeight = rect.height + (top ? -dy : dy);
	// Project onto the aspect diagonal instead of switching the controlling axis.
	const width = ratio
		? clamp(
				((draggedWidth * ratio + draggedHeight) * ratio) / (ratio * ratio + 1),
				0.01,
				Math.min(maxWidth, maxHeight * ratio),
			)
		: clamp(draggedWidth, 0.01, maxWidth);
	const height = ratio ? width / ratio : clamp(draggedHeight, 0.01, maxHeight);
	return {
		x: left ? anchorX - width : anchorX,
		y: top ? anchorY - height : anchorY,
		width,
		height,
	};
}
