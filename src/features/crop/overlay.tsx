import { type PointerEvent, useRef } from "react";
import type { View } from "@/hooks/use-pan-zoom";
import { dragRect, type Geometry, type Rect } from "./geometry";
import { RotationArea } from "./rotation-area";

type CropOverlayProps = {
	size: readonly [number, number];
	viewport: readonly [number, number];
	view: View;
	geometry: Geometry;
	ratio: number | null;
	onChange: (change: Partial<Geometry>) => void;
	onPan: (delta: readonly [number, number]) => void;
};
const corners = [
	{ handle: "nw", label: "top left", x: 0, y: 0 },
	{ handle: "ne", label: "top right", x: 1, y: 0 },
	{ handle: "sw", label: "bottom left", x: 0, y: 1 },
	{ handle: "se", label: "bottom right", x: 1, y: 1 },
];

export function CropOverlay({
	size,
	viewport,
	view,
	geometry,
	ratio,
	onChange,
	onPan,
}: CropOverlayProps) {
	const selection = useRef<HTMLDivElement>(null);
	const drag = useRef<{
		rect: Rect;
		previous: Rect;
		handle: string;
		x: number;
		y: number;
	} | null>(null);
	const [width, height] = size;
	const scale =
		Math.min(viewport[0] / width, viewport[1] / height, 2 / devicePixelRatio) *
		view.zoom;
	const box = [width * scale, height * scale];
	function move(next: Rect, previous: Rect) {
		onPan([(previous.x - next.x) * box[0], (previous.y - next.y) * box[1]]);
		onChange(next);
	}
	function handle(event: PointerEvent<HTMLDivElement>) {
		if (event.button !== 0) {
			return;
		}
		event.stopPropagation();
		const corner =
			event.target instanceof Element && event.target.closest("[data-handle]");
		drag.current = {
			rect: geometry,
			previous: geometry,
			handle: corner ? (corner.getAttribute("data-handle") ?? "move") : "move",
			x: event.clientX,
			y: event.clientY,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		event.preventDefault();
		if (event.target instanceof Element) {
			event.target.closest("button")?.focus();
		}
	}
	return (
		<div className="pointer-events-none absolute inset-0">
			<RotationArea
				selection={selection}
				angle={geometry.angle}
				onChange={(angle) => onChange({ angle })}
			/>
			<div
				className="absolute top-1/2 left-1/2 -translate-1/2"
				style={{
					width: box[0],
					height: box[1],
					marginLeft: view.pan[0],
					marginTop: view.pan[1],
				}}
			>
				<div
					ref={selection}
					role="application"
					aria-label="Crop selection"
					className="pointer-events-auto absolute cursor-move touch-none border border-white shadow-[0_0_0_9999px_#0009] outline-none focus-visible:ring-2 focus-visible:ring-white/50"
					style={{
						left: `${geometry.x * 100}%`,
						top: `${geometry.y * 100}%`,
						width: `${geometry.width * 100}%`,
						height: `${geometry.height * 100}%`,
					}}
					onPointerDown={handle}
					onPointerMove={(event) => {
						const current = drag.current;
						if (current) {
							const sign = current.handle === "move" ? -1 : 1;
							const next = dragRect(
								current.rect,
								current.handle,
								(sign * (event.clientX - current.x)) / box[0],
								(sign * (event.clientY - current.y)) / box[1],
								ratio,
							);
							if (current.handle === "move") {
								move(next, current.previous);
							} else {
								onChange(next);
							}
							current.previous = next;
						}
					}}
					onPointerUp={() => {
						drag.current = null;
					}}
					onPointerCancel={() => {
						drag.current = null;
					}}
					onLostPointerCapture={() => {
						drag.current = null;
					}}
					onKeyDown={(event) => {
						const directions: Record<string, [number, number]> = {
							ArrowLeft: [-1, 0],
							ArrowRight: [1, 0],
							ArrowUp: [0, -1],
							ArrowDown: [0, 1],
						};
						const direction = directions[event.key];
						if (!direction) {
							return;
						}
						event.preventDefault();
						const corner =
							event.target instanceof HTMLElement
								? (event.target.dataset.handle ?? "move")
								: "move";
						const sign = corner === "move" ? -1 : 1;
						const step = (event.shiftKey ? 0.05 : 0.005) * sign;
						const next = dragRect(
							geometry,
							corner,
							direction[0] * step,
							direction[1] * step,
							ratio,
						);
						if (corner === "move") {
							move(next, geometry);
						} else {
							onChange(next);
						}
					}}
				>
					<button
						type="button"
						aria-label="Move crop"
						className="absolute inset-0 cursor-move focus-visible:outline-2 focus-visible:outline-white"
					/>
					<div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
						{Array.from({ length: 9 }, (_, index) => (
							<div key={index} className="border border-white/20" />
						))}
					</div>
					{corners.map(({ handle, label, x, y }) => (
						<button
							type="button"
							key={handle}
							data-handle={handle}
							aria-label={`Resize crop ${label}`}
							className="group absolute flex size-8 -translate-1/2 items-center justify-center outline-none"
							style={{
								left: `${x * 100}%`,
								top: `${y * 100}%`,
								cursor: x === y ? "nwse-resize" : "nesw-resize",
							}}
						>
							<span className="pointer-events-none size-2.5 border border-neutral-900 bg-white group-focus-visible:ring-2 group-focus-visible:ring-neutral-400/50" />
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
