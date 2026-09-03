import {
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	useRef,
	useState,
} from "react";
import {
	type Curve,
	type CurvePoint,
	interpolateCurve,
	sampleCurve,
} from "@/lib/curves";

const gap = 1 / 1024;

function gridLines(spacing: number) {
	return Array.from({ length: 256 / spacing - 1 }, (_, index) => {
		const position = (index + 1) * spacing;
		return `M${position} 0V256 M0 ${position}H256`;
	}).join(" ");
}

function clamp(value: number, min = 0, max = 1) {
	return Math.min(max, Math.max(min, value));
}

function position(event: MouseEvent<SVGSVGElement>): CurvePoint {
	const bounds = event.currentTarget.getBoundingClientRect();
	return {
		x: clamp((event.clientX - bounds.left) / bounds.width),
		y: clamp(1 - (event.clientY - bounds.top) / bounds.height),
	};
}

type GraphProps = { points: Curve; onChange: (points: Curve) => void };

export default function Graph({ points, onChange }: GraphProps) {
	const [selected, select] = useState<number | null>(null);
	const dragging = useRef<number | null>(null);
	const line = Array.from(
		sampleCurve(points, 257),
		(y, x) => `${x},${256 * (1 - y)}`,
	).join(" ");
	function move(index: number, point: CurvePoint) {
		if (!points[index]) {
			return;
		}
		let x = clamp(point.x);
		let y = clamp(point.y);
		if (index === 0) {
			x = Math.min(x, points[1].x - gap);
			if (x < y) {
				x = 0;
			} else {
				y = 0;
			}
		} else if (index === points.length - 1) {
			x = Math.max(x, points[index - 1].x + gap);
			if (x > y) {
				x = 1;
			} else {
				y = 1;
			}
		} else {
			x = clamp(x, points[index - 1].x + gap, points[index + 1].x - gap);
		}
		onChange(points.with(index, { x, y }));
	}
	function remove(index: number) {
		if (index > 0 && index < points.length - 1) {
			onChange(points.toSpliced(index, 1));
			select(null);
		}
	}
	function hitTest(event: MouseEvent<SVGSVGElement>) {
		const point = position(event);
		const size = event.currentTarget.getBoundingClientRect().width;
		return points.findIndex(
			(candidate) =>
				Math.hypot(candidate.x - point.x, candidate.y - point.y) * size <= 12,
		);
	}
	function doubleClick(event: MouseEvent<SVGSVGElement>) {
		const index = hitTest(event);
		if (index === 0) {
			move(index, { x: 0, y: 0 });
		} else if (index === points.length - 1) {
			move(index, { x: 1, y: 1 });
		} else {
			remove(index);
		}
	}
	function insert(point: CurvePoint) {
		const index = points.findIndex((next) => next.x > point.x);
		if (
			index <= 0 ||
			point.x - points[index - 1].x < gap ||
			points[index].x - point.x < gap
		) {
			return null;
		}
		onChange(points.toSpliced(index, 0, point));
		select(index);
		return index;
	}
	function start(event: PointerEvent<SVGSVGElement>) {
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		event.currentTarget.focus();
		const point = position(event);
		let index = hitTest(event);
		if (index < 0) {
			const added = insert(point);
			if (added === null) {
				return;
			}
			index = added;
		}
		select(index);
		dragging.current = index;
		event.currentTarget.setPointerCapture(event.pointerId);
	}
	function keyDown(event: KeyboardEvent<SVGSVGElement>) {
		if (event.key === "Enter") {
			event.preventDefault();
			let widest = 0;
			for (let i = 1; i < points.length - 1; i++) {
				if (
					points[i + 1].x - points[i].x >
					points[widest + 1].x - points[widest].x
				) {
					widest = i;
				}
			}
			const x = (points[widest].x + points[widest + 1].x) / 2;
			insert({ x, y: interpolateCurve(points)(x) });
			return;
		}
		if (selected === null || !points[selected]) {
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			remove(selected);
			return;
		}
		const directions: Record<string, CurvePoint> = {
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowDown: { x: 0, y: -1 },
			ArrowUp: { x: 0, y: 1 },
		};
		const direction = directions[event.key];
		if (direction) {
			event.preventDefault();
			let step = 0.001;
			if (event.shiftKey) {
				step = 0.01;
			}
			move(selected, {
				x: points[selected].x + direction.x * step,
				y: points[selected].y + direction.y * step,
			});
		}
	}
	return (
		<svg
			aria-label="Tone curve"
			aria-description="Click or press Enter to add a point. Drag or use arrow keys to move it. Endpoints follow the edges. Shift moves faster. Double-click resets an endpoint or removes an interior point. Delete removes an interior point."
			className="absolute inset-0 h-full w-full cursor-crosshair touch-none overflow-visible outline-none"
			onDoubleClick={doubleClick}
			onKeyDown={keyDown}
			onLostPointerCapture={() => {
				dragging.current = null;
			}}
			onPointerDown={start}
			onPointerMove={(event) => {
				if (dragging.current !== null) {
					move(dragging.current, position(event));
				}
			}}
			role="application"
			tabIndex={-1}
			viewBox="0 0 256 256"
		>
			<path
				d={gridLines(8)}
				fill="none"
				stroke="white"
				strokeOpacity="0.04"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d={gridLines(32)}
				fill="none"
				stroke="white"
				strokeOpacity="0.07"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d="M0 256L256 0"
				fill="none"
				stroke="#a3a3a3"
				strokeDasharray="3 4"
				strokeOpacity="0.2"
			/>
			<polyline
				className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]"
				fill="none"
				points={line}
				stroke="#e5e5e5"
				strokeWidth="2"
			/>
			{points.map((point, index) => (
				<circle
					className="fill-neutral-800 stroke-neutral-200 data-[selected=true]:fill-neutral-100"
					cx={point.x * 256}
					cy={(1 - point.y) * 256}
					data-selected={selected === index}
					key={point.x}
					r="4"
					strokeWidth="2"
				/>
			))}
		</svg>
	);
}
