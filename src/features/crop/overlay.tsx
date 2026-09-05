import { type PointerEvent, useRef } from "react";
import { useStore } from "zustand";
import {
	type CropDraft,
	dragCrop,
	type Geometry,
	orientedSize,
} from "./geometry";
import rotateCursor from "./rotate-cursor.svg";
import type { CropTool } from "./tool";

type CropOverlayProps = {
	tool: CropTool;
	frame: {
		width: number;
		height: number;
		marginLeft: number;
		marginTop: number;
	};
};
const corners = ["nw", "ne", "sw", "se"];
const directions: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};
function bearing(x: number, y: number, bounds: DOMRect) {
	return Math.atan2(
		y - bounds.top - bounds.height / 2,
		x - bounds.left - bounds.width / 2,
	);
}

function CropSelection({
	tool,
	frame,
	crop,
}: CropOverlayProps & { crop: CropDraft }) {
	const selection = useRef<HTMLDivElement>(null);
	const drag = useRef<((event: PointerEvent<HTMLDivElement>) => void) | null>(
		null,
	);
	const { geometry, aspect } = crop;
	const { size, change: onChange } = tool;
	const [width, height] = orientedSize(size, geometry.rotation);
	const ratio = aspect && (aspect * height) / width;
	function move(start: Geometry, handle: string, dx: number, dy: number) {
		const factor = handle === "move" ? -1 : 2;
		onChange(dragCrop(start, handle, dx * factor, dy * factor, ratio, size));
	}
	function hit(event: PointerEvent<HTMLDivElement>) {
		const bounds = selection.current?.getBoundingClientRect();
		const target =
			event.target instanceof Element && event.target.closest("[data-handle]");
		if (target) {
			return target.getAttribute("data-handle") ?? "move";
		}
		return bounds &&
			Math.hypot(
				Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right),
				Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom),
			) >= 50
			? "rotate"
			: null;
	}
	return (
		<div
			className="absolute -inset-6 touch-none"
			onPointerDown={(event) => {
				const handle = hit(event);
				const bounds = selection.current?.getBoundingClientRect();
				if (event.button !== 0 || !event.isPrimary || !handle || !bounds) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				if (event.target instanceof HTMLElement) {
					event.target.closest("button")?.focus();
				}
				const pointerId = event.pointerId;
				const startX = event.clientX;
				const startY = event.clientY;
				drag.current = (pointer) => {
					if (pointer.pointerId !== pointerId) {
						return;
					}
					if (handle === "rotate") {
						const delta =
							bearing(pointer.clientX, pointer.clientY, bounds) -
							bearing(startX, startY, bounds);
						const angle =
							geometry.angle +
							(Math.atan2(Math.sin(delta), Math.cos(delta)) * 180) / Math.PI;
						onChange({
							angle: Math.max(-45, Math.min(45, Math.round(angle * 10) / 10)),
						});
					} else {
						move(
							geometry,
							handle,
							((pointer.clientX - startX) * geometry.width) / bounds.width,
							((pointer.clientY - startY) * geometry.height) / bounds.height,
						);
					}
				};
			}}
			onPointerMove={(event) => {
				if (drag.current) {
					drag.current(event);
					return;
				}
				event.currentTarget.style.cursor =
					hit(event) === "rotate"
						? `url("${rotateCursor}") 12 12, crosshair`
						: "inherit";
			}}
			onLostPointerCapture={() => {
				drag.current = null;
			}}
		>
			<div
				ref={selection}
				role="application"
				aria-label="Crop selection"
				data-handle="move"
				className="absolute top-1/2 left-1/2 -translate-1/2 cursor-grab border border-white shadow-[0_0_0_9999px_#0009] active:cursor-grabbing"
				style={frame}
				onKeyDown={(event) => {
					const delta = directions[event.key];
					if (!delta) {
						return;
					}
					event.preventDefault();
					const handle =
						event.target instanceof HTMLElement
							? (event.target.dataset.handle ?? "move")
							: "move";
					const step = event.shiftKey ? 0.05 : 0.005;
					move(geometry, handle, delta[0] * step, delta[1] * step);
				}}
			>
				<button
					type="button"
					aria-label="Move crop"
					className="absolute inset-0 cursor-[inherit] focus-visible:outline-2 focus-visible:outline-white"
				/>
				<div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
					{Array.from({ length: 9 }, (_, i) => (
						<div key={i} className="border border-white/20" />
					))}
				</div>
				{corners.map((handle, i) => (
					<button
						key={handle}
						type="button"
						data-handle={handle}
						aria-label={`Resize crop ${i < 2 ? "top" : "bottom"} ${i % 2 ? "right" : "left"}`}
						className="group absolute flex size-8 -translate-1/2 items-center justify-center outline-none"
						style={{
							left: `${(i % 2) * 100}%`,
							top: `${Math.floor(i / 2) * 100}%`,
							cursor: i === 0 || i === 3 ? "nwse-resize" : "nesw-resize",
						}}
					>
						<span className="pointer-events-none size-2.5 border border-neutral-900 bg-white group-focus-visible:ring-2 group-focus-visible:ring-neutral-400/50" />
					</button>
				))}
			</div>
		</div>
	);
}

export function CropOverlay(props: CropOverlayProps) {
	const crop = useStore(props.tool.state);
	return crop && <CropSelection {...props} crop={crop} />;
}
