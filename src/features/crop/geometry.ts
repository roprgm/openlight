export type Rect = { x: number; y: number; width: number; height: number };
export type Geometry = Rect & {
	rotation: number;
	angle: number;
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

export function validateGeometry(geometry: Geometry) {
	const { x, y, width, height, rotation, angle, scale } = geometry;
	if (
		Object.values(geometry).some((value) => !Number.isFinite(value)) ||
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

/** Turn around the crop's current source point, fitting its corners inside the image. */
function straighten(
	geometry: Geometry,
	angle: number,
	size: readonly number[],
): Geometry {
	const [width, height] = orientedSize(size, geometry.rotation);
	const x = geometry.x + geometry.width / 2 - 0.5;
	const y = geometry.y + geometry.height / 2 - 0.5;
	const inverse = (degrees: number) => {
		const radians = (degrees * Math.PI) / 180;
		return [
			Math.cos(radians) * x + (Math.sin(radians) * y * height) / width,
			(-Math.sin(radians) * x * width) / height + Math.cos(radians) * y,
		];
	};
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
	return next;
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
	let width = clamp(rect.width + (left ? -dx : dx), 0.01, maxWidth);
	let height = clamp(rect.height + (top ? -dy : dy), 0.01, maxHeight);
	if (ratio) {
		width = Math.min(
			Math.abs(dx) >= Math.abs(dy) * ratio ? width : height * ratio,
			maxWidth,
			maxHeight * ratio,
		);
		height = width / ratio;
	}
	return {
		x: left ? anchorX - width : anchorX,
		y: top ? anchorY - height : anchorY,
		width,
		height,
	};
}
