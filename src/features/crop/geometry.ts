export type Rect = { x: number; y: number; width: number; height: number };
// The rectangle's center is a source point; its dimensions describe the output frame.
export type Geometry = Rect & {
	rotation: number;
	angle: number;
	flipX: boolean;
	flipY: boolean;
	scale: number;
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
export function cropTransform(g: Geometry, size: readonly number[]) {
	const [width, height] = orientedSize(size, g.rotation);
	const center = rotate(
		(g.x + g.width / 2 - 0.5) * width,
		(g.y + g.height / 2 - 0.5) * height,
		-g.rotation,
	);
	const xAxis = rotate(
		(g.width * width * (g.flipX ? -1 : 1)) / g.scale,
		0,
		-g.rotation - g.angle,
	).map((v, i) => v / size[i]);
	const yAxis = rotate(
		0,
		(g.height * height * (g.flipY ? -1 : 1)) / g.scale,
		-g.rotation - g.angle,
	).map((v, i) => v / size[i]);
	return {
		origin: center.map((v, i) => v / size[i] + 0.5 - (xAxis[i] + yAxis[i]) / 2),
		xAxis,
		yAxis,
	};
}

function corners(g: Geometry, size: readonly number[]) {
	const { origin, xAxis, yAxis } = cropTransform(g, size);
	return [0, 1].flatMap((x) =>
		[0, 1].flatMap((y) =>
			origin.map((v, i) => v + x * xAxis[i] + y * yAxis[i]),
		),
	);
}

/** Clip a frame gesture at its first source edge, preserving its anchor and aspect. */
function constrain(
	previous: Geometry,
	next: Geometry,
	size: readonly number[],
	moving: boolean,
) {
	const start = corners(previous, size);
	const end = corners(next, size);
	if (moving) {
		// Slide along reached edges by clamping each source axis independently.
		const correction = [0, 1].map((axis) => {
			const values = end.filter((_, i) => i % 2 === axis);
			return (
				(Math.max(0, -Math.min(...values)) +
					Math.min(0, 1 - Math.max(...values))) *
				size[axis]
			);
		});
		const [x, y] = rotate(correction[0], correction[1], next.rotation);
		const [width, height] = orientedSize(size, next.rotation);
		return { ...next, x: next.x + x / width, y: next.y + y / height };
	}
	let fraction = 1;
	for (const [i, value] of end.entries()) {
		if (value < -1e-9 || value > 1 + 1e-9) {
			fraction = Math.min(
				fraction,
				Math.max(
					0,
					(Math.min(1, Math.max(0, value)) - start[i]) / (value - start[i]),
				),
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
	if (corners(next, size).some((v) => v < -1e-9 || v > 1 + 1e-9)) {
		throw new Error("Invalid crop: outside the image.");
	}
	return next;
}

export function rotateCrop(g: Geometry, direction: -1 | 1 = 1): Geometry {
	return {
		...g,
		x: direction === 1 ? 1 - g.y - g.height : g.y,
		y: direction === 1 ? g.x : 1 - g.x - g.width,
		width: g.height,
		height: g.width,
		rotation: (g.rotation + direction * 90 + 360) % 360,
		flipX: g.flipY,
		flipY: g.flipX,
	};
}

export function flipCrop(
	g: Geometry,
	axis: "horizontal" | "vertical",
): Geometry {
	const key = axis === "horizontal" ? "flipX" : "flipY";
	return { ...g, [key]: !g[key] };
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
	g: Geometry,
	handle: string,
	dx: number,
	dy: number,
	ratio: number | null,
	size: readonly number[],
): Geometry {
	const [imageWidth, imageHeight] = orientedSize(size, g.rotation);
	const sx = handle.includes("w") ? -1 : 1;
	const sy = handle.includes("n") ? -1 : 1;
	let width = g.width;
	let height = g.height;
	if (handle !== "move") {
		const w = g.width + sx * dx;
		const h = g.height + sy * dy;
		width = Math.max(
			0.01,
			ratio ? ((w * ratio + h) * ratio) / (ratio * ratio + 1) : w,
		);
		height = ratio ? width / ratio : Math.max(0.01, h);
	}
	const offsetX = handle === "move" ? dx : ((width - g.width) * sx) / 2;
	const offsetY = handle === "move" ? dy : ((height - g.height) * sy) / 2;
	const shift = rotate(
		offsetX * imageWidth * (g.flipX ? -1 : 1),
		offsetY * imageHeight * (g.flipY ? -1 : 1),
		-g.angle,
	);
	return constrain(
		g,
		{
			...g,
			x: g.x + (g.width - width) / 2 + shift[0] / imageWidth / g.scale,
			y: g.y + (g.height - height) / 2 + shift[1] / imageHeight / g.scale,
			width,
			height,
		},
		size,
		handle === "move",
	);
}
