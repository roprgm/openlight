import {
	type ImageFrame,
	type Point,
	sourceOffset,
} from "@/lib/image-frame/geometry";
import { clamp } from "@/lib/math";

function radius(frame: ImageFrame): Point {
	const x = sourceOffset(frame, frame.size[0] / 2, 0);
	const y = sourceOffset(frame, 0, frame.size[1] / 2);
	return [Math.abs(x[0]) + Math.abs(y[0]), Math.abs(x[1]) + Math.abs(y[1])];
}

/** Translation slides independently along source edges. */
export function move(
	frame: ImageFrame,
	dx: number,
	dy: number,
	source: Point,
): ImageFrame {
	const offset = sourceOffset(frame, dx, dy);
	const half = radius(frame);
	return {
		...frame,
		center: [
			clamp(frame.center[0] + offset[0], half[0], source[0] - half[0]),
			clamp(frame.center[1] + offset[1], half[1], source[1] - half[1]),
		],
	};
}

/** Resize from the opposite source corner, stopping the entire gesture at the first edge. */
export function resize(
	frame: ImageFrame,
	corner: string,
	dx: number,
	dy: number,
	ratio: number | null,
	source: Point,
): ImageFrame {
	const sx = corner.includes("w") ? -1 : 1;
	const sy = corner.includes("n") ? -1 : 1;
	const width = frame.size[0] + sx * dx;
	const height = frame.size[1] + sy * dy;
	const w = ratio
		? Math.max(
				1,
				ratio,
				((width * ratio + height) * ratio) / (ratio * ratio + 1),
			)
		: Math.max(1, width);
	const h = ratio ? w / ratio : Math.max(1, height);
	const offset = sourceOffset(
		frame,
		((w - frame.size[0]) * sx) / 2,
		((h - frame.size[1]) * sy) / 2,
	);
	const before = radius(frame);
	const after = radius({ ...frame, size: [w, h] });
	let fraction = 1;
	for (const axis of [0, 1]) {
		for (const sign of [-1, 1]) {
			const start = frame.center[axis] + sign * before[axis];
			const end = frame.center[axis] + offset[axis] + sign * after[axis];
			if (end < -1e-7 || end > source[axis] + 1e-7) {
				fraction = Math.min(
					fraction,
					clamp((clamp(end, 0, source[axis]) - start) / (end - start)),
				);
			}
		}
	}
	const blend = (a: number, b: number) => a + (b - a) * fraction;
	return {
		...frame,
		size: [blend(frame.size[0], w), blend(frame.size[1], h)],
		center: [
			frame.center[0] + offset[0] * fraction,
			frame.center[1] + offset[1] * fraction,
		],
	};
}

/** Magnify around the current source center only as much as coverage requires. */
export function rotate(
	frame: ImageFrame,
	angle: number,
	source: Point,
): ImageFrame {
	const next: ImageFrame = {
		...frame,
		angle,
		scale: [Math.sign(frame.scale[0]), Math.sign(frame.scale[1])],
	};
	const half = radius(next);
	const scale = Math.min(
		1,
		...source.map(
			(size, axis) =>
				Math.min(frame.center[axis], size - frame.center[axis]) / half[axis],
		),
	);
	return { ...next, scale: [next.scale[0] * scale, next.scale[1] * scale] };
}

export function turn(frame: ImageFrame, direction: number): ImageFrame {
	return {
		...frame,
		rotation: (frame.rotation + direction * 90 + 360) % 360,
		size: [frame.size[1], frame.size[0]],
		scale: [frame.scale[1], frame.scale[0]],
	};
}

export function flip(frame: ImageFrame, axis: number): ImageFrame {
	const [x, y] = frame.scale;
	return { ...frame, scale: axis === 0 ? [-x, y] : [x, -y] };
}

export function fitRatio(frame: ImageFrame, ratio: number): ImageFrame {
	const width = Math.min(frame.size[0], frame.size[1] * ratio);
	return { ...frame, size: [width, width / ratio] };
}
