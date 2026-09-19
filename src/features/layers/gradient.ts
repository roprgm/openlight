import type { Gradient, LinearGradient, RadialGradient } from "@/core/document";
import type { Point } from "@/core/image/frame";

export const gradientHandles = [
	"move",
	"start",
	"end",
	"rotate",
	"radius-x",
	"radius-y",
	"feather",
] as const;
export type GradientHandle = (typeof gradientHandles)[number];

export function drawGradient(
	kind: Gradient["kind"],
	from: Point,
	to: Point,
	constrain = false,
): Gradient {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	if (kind === "radial") {
		const radius: Point = [
			Math.max(1, Math.abs(dx)),
			Math.max(1, Math.abs(dy)),
		];
		if (constrain) {
			return {
				kind,
				center: from,
				radius: [Math.max(...radius), Math.max(...radius)],
				angle: 0,
				feather: 0.5,
			};
		}
		return { kind, center: from, radius, angle: 0, feather: 0.5 };
	}
	if (!constrain) {
		return { kind, start: from, end: to };
	}
	const end: Point =
		Math.abs(dx) > Math.abs(dy) ? [to[0], from[1]] : [from[0], to[1]];
	return { kind, start: from, end };
}

function rotate(point: Point, angle: number): Point {
	return [
		point[0] * Math.cos(angle) - point[1] * Math.sin(angle),
		point[0] * Math.sin(angle) + point[1] * Math.cos(angle),
	];
}

/** Map an ellipse's unit coordinates into the source image. */
export function radialPoint(mask: RadialGradient, x: number, y: number): Point {
	const offset = rotate(
		[x * mask.radius[0], y * mask.radius[1]],
		(mask.angle * Math.PI) / 180,
	);
	return [mask.center[0] + offset[0], mask.center[1] + offset[1]];
}

function moveLinear(
	mask: LinearGradient,
	handle: GradientHandle,
	from: Point,
	to: Point,
): LinearGradient {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	if (handle === "move") {
		return {
			...mask,
			start: [mask.start[0] + dx, mask.start[1] + dy],
			end: [mask.end[0] + dx, mask.end[1] + dy],
		};
	}
	const vx = mask.end[0] - mask.start[0];
	const vy = mask.end[1] - mask.start[1];
	const length = Math.hypot(vx, vy);
	if (handle === "rotate") {
		const center: Point = [
			(mask.start[0] + mask.end[0]) / 2,
			(mask.start[1] + mask.end[1]) / 2,
		];
		const angle =
			Math.atan2(to[1] - center[1], to[0] - center[0]) -
			Math.atan2(from[1] - center[1], from[0] - center[0]);
		const offset = rotate([vx / 2, vy / 2], angle);
		return {
			...mask,
			start: [center[0] - offset[0], center[1] - offset[1]],
			end: [center[0] + offset[0], center[1] + offset[1]],
		};
	}
	if (handle !== "start" && handle !== "end") {
		return mask;
	}
	const amount = (dx * vx + dy * vy) / length;
	const distance =
		handle === "start"
			? Math.min(amount, length - 1)
			: Math.max(amount, 1 - length);
	const point: Point = [
		mask[handle][0] + (vx / length) * distance,
		mask[handle][1] + (vy / length) * distance,
	];
	return { ...mask, [handle]: point };
}

export function moveGradient(
	mask: Gradient,
	handle: GradientHandle,
	from: Point,
	to: Point,
): Gradient {
	if (mask.kind === "linear") {
		return moveLinear(mask, handle, from, to);
	}
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	if (handle === "move") {
		return { ...mask, center: [mask.center[0] + dx, mask.center[1] + dy] };
	}
	if (handle === "rotate") {
		const angle =
			Math.atan2(to[1] - mask.center[1], to[0] - mask.center[0]) -
			Math.atan2(from[1] - mask.center[1], from[0] - mask.center[0]);
		return { ...mask, angle: mask.angle + (angle * 180) / Math.PI };
	}
	const angle = (-mask.angle * Math.PI) / 180;
	const delta = rotate([dx, dy], angle);
	const origin = rotate(
		[from[0] - mask.center[0], from[1] - mask.center[1]],
		angle,
	);
	if (handle === "radius-x") {
		return {
			...mask,
			radius: [
				Math.max(1, mask.radius[0] + delta[0] * Math.sign(origin[0])),
				mask.radius[1],
			],
		};
	}
	if (handle === "radius-y") {
		return {
			...mask,
			radius: [
				mask.radius[0],
				Math.max(1, mask.radius[1] + delta[1] * Math.sign(origin[1])),
			],
		};
	}
	if (handle === "feather") {
		return {
			...mask,
			feather: Math.max(
				0,
				Math.min(1, mask.feather - delta[0] / mask.radius[0]),
			),
		};
	}
	return mask;
}
