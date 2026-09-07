export type Point = readonly [number, number];
export type ImageFrame = {
	center: Point;
	size: Point;
	rotation: number;
	angle: number;
	scale: Point;
};

/** Source pixels under the output center, output dimensions, and signed source scale. */
export function imageFrame(size: readonly number[]): ImageFrame {
	return {
		center: [size[0] / 2, size[1] / 2],
		size: [size[0], size[1]],
		rotation: 0,
		angle: 0,
		scale: [1, 1],
	};
}

export function frameValues(frame: ImageFrame) {
	return [
		...frame.center,
		...frame.size,
		...frame.scale,
		frame.rotation,
		frame.angle,
	];
}

export function validateFrame(frame: ImageFrame) {
	if (
		!frameValues(frame).every(Number.isFinite) ||
		frame.size.some((value) => value < 1) ||
		frame.scale.some((value) => value === 0)
	) {
		throw new Error("Invalid image frame.");
	}
}

export function sourceOffset(frame: ImageFrame, x: number, y: number): Point {
	const angle = (-(frame.rotation + frame.angle) * Math.PI) / 180;
	const dx = x * frame.scale[0];
	const dy = y * frame.scale[1];
	return [
		Math.cos(angle) * dx - Math.sin(angle) * dy,
		Math.sin(angle) * dx + Math.cos(angle) * dy,
	];
}

/** Affine UV mapping used by image display and resampling, independent of editing tools. */
export function frameTransform(
	frame: ImageFrame,
	sourceSize: readonly number[],
) {
	const xAxis = sourceOffset(frame, frame.size[0], 0).map(
		(value, axis) => value / sourceSize[axis],
	);
	const yAxis = sourceOffset(frame, 0, frame.size[1]).map(
		(value, axis) => value / sourceSize[axis],
	);
	const origin = frame.center.map(
		(value, axis) => value / sourceSize[axis] - (xAxis[axis] + yAxis[axis]) / 2,
	);
	return { origin, xAxis, yAxis };
}
