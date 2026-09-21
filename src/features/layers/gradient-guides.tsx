import { rotateCursor } from "@/components/icons/rotate-cursor";
import type { Gradient, RadialGradient } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { type GradientHandle, radialPoint } from "./gradient";

const rotationCursor = rotateCursor();

function resizeCursor(from: Point, to: Point) {
	const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
	const direction = (Math.round(angle / (Math.PI / 4)) + 4) % 4;
	return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][direction];
}

function Handle({
	point,
	handle,
	label,
	cursor = "grab",
}: {
	point: Point;
	handle: GradientHandle;
	label: string;
	cursor?: string;
}) {
	return (
		<g className="group/handle" style={{ cursor }}>
			<title>{label}</title>
			<circle
				cx={point[0]}
				cy={point[1]}
				r="12"
				fill="transparent"
				data-gradient-handle={handle}
				aria-label={label}
				className="pointer-events-auto"
			/>
			<circle
				cx={point[0]}
				cy={point[1]}
				r="4"
				fill="white"
				stroke="#171717"
				className="group-hover/handle:fill-sky-300"
			/>
		</g>
	);
}

function Guide({
	point,
	direction,
	handle,
	cursor,
}: {
	point: Point;
	direction: Point;
	handle: GradientHandle;
	cursor: string;
}) {
	const line = {
		x1: point[0] - direction[0],
		y1: point[1] - direction[1],
		x2: point[0] + direction[0],
		y2: point[1] + direction[1],
	};
	return (
		<g>
			<line {...line} stroke="black" strokeOpacity="0.6" strokeWidth="3" />
			<line {...line} stroke="white" strokeOpacity="0.9" />
			<line
				{...line}
				stroke="transparent"
				strokeWidth="16"
				data-gradient-handle={handle}
				aria-label={`Gradient ${handle} guide`}
				className="[pointer-events:stroke]"
				style={{ cursor }}
			/>
		</g>
	);
}

function LinearGuides({
	startPoint,
	endPoint,
	extent,
}: {
	startPoint: Point;
	endPoint: Point;
	extent: number;
}) {
	const dx = endPoint[0] - startPoint[0],
		dy = endPoint[1] - startPoint[1];
	const length = Math.max(1, Math.hypot(dx, dy));
	const direction: Point = [(-dy / length) * extent, (dx / length) * extent];
	const center: Point = [
		(startPoint[0] + endPoint[0]) / 2,
		(startPoint[1] + endPoint[1]) / 2,
	];
	return (
		<g>
			<title>Linear gradient guides</title>
			<Guide
				point={startPoint}
				direction={direction}
				handle="start"
				cursor={resizeCursor(startPoint, endPoint)}
			/>
			<Guide
				point={endPoint}
				direction={direction}
				handle="end"
				cursor={resizeCursor(startPoint, endPoint)}
			/>
			<Guide
				point={center}
				direction={direction}
				handle="rotate"
				cursor={rotationCursor}
			/>
			<Handle point={center} handle="move" label="Move gradient" />
		</g>
	);
}

function RadialGuides({
	mask,
	screen,
}: {
	mask: RadialGradient;
	screen: (point: Point) => Point;
}) {
	const center = screen(mask.center);
	const right = screen(radialPoint(mask, 1, 0));
	const bottom = screen(radialPoint(mask, 0, 1));
	const feather = screen(radialPoint(mask, 1 - mask.feather, 0));
	const showFeather =
		Math.min(
			Math.hypot(feather[0] - center[0], feather[1] - center[1]),
			Math.hypot(feather[0] - right[0], feather[1] - right[1]),
		) >= 24;
	const rotationRadius =
		1 +
		24 / Math.max(1, Math.hypot(bottom[0] - center[0], bottom[1] - center[1]));
	const transform = `matrix(${right[0] - center[0]},${right[1] - center[1]},${bottom[0] - center[0]},${bottom[1] - center[1]},${center[0]},${center[1]})`;
	return (
		<g>
			<title>Radial gradient guides</title>
			<g transform={transform} fill="none" stroke="white">
				<circle
					r="1"
					fill="transparent"
					stroke="none"
					data-gradient-handle="move"
					aria-label="Move radial gradient"
					className="pointer-events-auto cursor-grab hover:fill-white/5"
				/>
				<circle
					r="1"
					stroke="black"
					strokeOpacity="0.6"
					strokeWidth="3"
					vectorEffect="non-scaling-stroke"
				/>
				<circle r="1" strokeOpacity="0.9" vectorEffect="non-scaling-stroke" />
				<circle
					r={1 - mask.feather}
					strokeDasharray="4 3"
					strokeOpacity="0.8"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={`M0 -1V${-rotationRadius}`}
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<Handle point={center} handle="move" label="Move gradient" />
			<Handle
				point={right}
				handle="radius-x"
				label="Radial right radius"
				cursor={resizeCursor(center, right)}
			/>
			<Handle
				point={screen(radialPoint(mask, -1, 0))}
				handle="radius-x"
				label="Radial left radius"
				cursor={resizeCursor(center, right)}
			/>
			<Handle
				point={bottom}
				handle="radius-y"
				label="Radial bottom radius"
				cursor={resizeCursor(center, bottom)}
			/>
			<Handle
				point={screen(radialPoint(mask, 0, -1))}
				handle="radius-y"
				label="Radial top radius"
				cursor={resizeCursor(center, bottom)}
			/>
			<Handle
				point={screen(radialPoint(mask, 0, -rotationRadius))}
				handle="rotate"
				label="Rotate radial gradient"
				cursor={rotationCursor}
			/>
			{showFeather && (
				<Handle
					point={feather}
					handle="feather"
					label="Radial feather"
					cursor={resizeCursor(center, right)}
				/>
			)}
		</g>
	);
}

export function GradientGuides({
	mask,
	screen,
	extent,
}: {
	mask: Gradient;
	screen: (point: Point) => Point;
	extent: number;
}) {
	return (
		<svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
			<title>Gradient guides</title>
			{mask.kind === "linear" && (
				<LinearGuides
					startPoint={screen(mask.start)}
					endPoint={screen(mask.end)}
					extent={extent}
				/>
			)}
			{mask.kind === "radial" && <RadialGuides mask={mask} screen={screen} />}
		</svg>
	);
}
