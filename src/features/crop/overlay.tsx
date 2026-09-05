import { type PointerEvent, useRef } from "react";
import type { View } from "@/hooks/use-pan-zoom";
import {
	changeGeometry,
	dragRect,
	type Geometry,
	orientedSize,
	type Rect,
} from "./geometry";
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
		rect: Geometry;
		previous: Rect;
		handle: string;
		x: number;
		y: number;
	} | null>(null);
	const [width, height] = orientedSize(size, geometry.rotation);
	const scale =
		Math.min(viewport[0] / width, viewport[1] / height, 2 / devicePixelRatio) *
		view.zoom;
	const box = [width * scale, height * scale];
	function dragCrop(
		handle: string,
		start: Geometry,
		previous: Rect,
		dx: number,
		dy: number,
	) {
		// Centered resizing moves both screen edges, so the source delta doubles.
		const factor = handle === "move" ? -1 : 2;
		const next = changeGeometry(
			start,
			dragRect(start, handle, dx * factor, dy * factor, ratio),
			size,
		);
		onPan([
			(previous.x - next.x + (previous.width - next.width) / 2) * box[0],
			(previous.y - next.y + (previous.height - next.height) / 2) * box[1],
		]);
		onChange(next);
		return next;
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
				ref={selection}
				role="application"
				aria-label="Crop selection"
				className="pointer-events-auto absolute top-1/2 left-1/2 -translate-1/2 cursor-grab touch-none border border-white shadow-[0_0_0_9999px_#0009] outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:cursor-grabbing"
				style={{
					width: geometry.width * box[0],
					height: geometry.height * box[1],
					marginLeft:
						view.pan[0] + (geometry.x + geometry.width / 2 - 0.5) * box[0],
					marginTop:
						view.pan[1] + (geometry.y + geometry.height / 2 - 0.5) * box[1],
				}}
				onPointerDown={handle}
				onPointerMove={(event) => {
					const current = drag.current;
					if (current) {
						current.previous = dragCrop(
							current.handle,
							current.rect,
							current.previous,
							(event.clientX - current.x) / box[0],
							(event.clientY - current.y) / box[1],
						);
					}
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
					const step = event.shiftKey ? 0.05 : 0.005;
					dragCrop(
						corner,
						geometry,
						geometry,
						direction[0] * step,
						direction[1] * step,
					);
				}}
			>
				<button
					type="button"
					aria-label="Move crop"
					className="absolute inset-0 cursor-[inherit] focus-visible:outline-2 focus-visible:outline-white"
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
	);
}
