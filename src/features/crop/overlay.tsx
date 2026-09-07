import { type PointerEvent, useRef } from "react";
import { useViewport } from "@/components/editor/viewport";
import rotateCursor from "@/components/icons/rotate-cursor.svg?raw";
import type { ImageFrame, Point } from "@/lib/image-frame/geometry";
import { clamp } from "@/lib/math";
import { move, resize, rotate } from "./geometry";

const corners = [
	["nw", "top left", 0, 0, "nwse-resize"],
	["ne", "top right", 100, 0, "nesw-resize"],
	["sw", "bottom left", 0, 100, "nesw-resize"],
	["se", "bottom right", 100, 100, "nwse-resize"],
] as const;
const arrows: Record<string, Point> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

export function CropOverlay({
	frame,
	source,
	ratio,
	onChange,
}: {
	frame: ImageFrame;
	source: Point;
	ratio: number | null;
	onChange: (frame: ImageFrame) => void;
}) {
	const camera = useViewport();
	const selection = useRef<HTMLDivElement>(null);
	const style = {
		width: frame.size[0] * camera.scale,
		height: frame.size[1] * camera.scale,
		marginLeft: camera.view.pan[0],
		marginTop: camera.view.pan[1],
	};
	function hit(event: PointerEvent) {
		const box = selection.current?.getBoundingClientRect();
		if (!box || !(event.target instanceof Element)) {
			return null;
		}
		const distance = Math.hypot(
			Math.max(box.left - event.clientX, 0, event.clientX - box.right),
			Math.max(box.top - event.clientY, 0, event.clientY - box.bottom),
		);
		const handle =
			event.target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
		return { box, handle: handle ?? (distance >= 50 ? "rotate" : null) };
	}
	function change(handle: string, dx: number, dy: number) {
		onChange(
			handle === "move"
				? move(frame, -dx, -dy, source)
				: resize(frame, handle, dx * 2, dy * 2, ratio, source),
		);
	}
	function start(event: PointerEvent<HTMLDivElement>) {
		const target = hit(event);
		if (event.button !== 0 || !event.isPrimary || !target?.handle) {
			return;
		}
		const { handle, box } = target;
		event.preventDefault();
		event.stopPropagation();
		const element = event.currentTarget;
		element.setPointerCapture(event.pointerId);
		if (event.target instanceof HTMLElement) {
			event.target.closest("button")?.focus();
		}
		const { clientX: x, clientY: y, pointerId } = event;
		const bearing = (px: number, py: number) =>
			Math.atan2(py - box.y - box.height / 2, px - box.x - box.width / 2);
		element.onpointermove = (pointer) => {
			if (pointer.pointerId !== pointerId) {
				return;
			}
			if (handle !== "rotate") {
				change(
					handle,
					(pointer.clientX - x) / camera.scale,
					(pointer.clientY - y) / camera.scale,
				);
				return;
			}
			const delta = bearing(pointer.clientX, pointer.clientY) - bearing(x, y);
			const angle =
				frame.angle +
				(Math.atan2(Math.sin(delta), Math.cos(delta)) * 180) / Math.PI;
			onChange(
				rotate(frame, clamp(Math.round(angle * 10) / 10, -45, 45), source),
			);
		};
		element.onlostpointercapture = () => {
			element.onpointermove = null;
		};
	}
	return (
		<div
			className="absolute -inset-6 touch-none"
			onPointerDown={start}
			onPointerMove={(event) => {
				const target = hit(event);
				if (target?.handle !== "rotate") {
					event.currentTarget.style.cursor = "inherit";
					return;
				}
				const { box } = target;
				const angle = Math.atan2(
					box.y + box.height / 2 - event.clientY,
					box.x + box.width / 2 - event.clientX,
				);
				const svg = rotateCursor.replace(
					'transform="',
					`transform="rotate(${Math.round((angle * 180) / Math.PI)} 12 12) `,
				);
				event.currentTarget.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
			}}
		>
			<div
				ref={selection}
				role="application"
				aria-label="Crop selection"
				data-handle="move"
				style={style}
				className="absolute top-1/2 left-1/2 -translate-1/2 cursor-grab border border-white bg-[linear-gradient(to_right,#fff3_1px,transparent_1px),linear-gradient(to_bottom,#fff3_1px,transparent_1px)] bg-size-[33.333%_33.333%] shadow-[0_0_0_9999px_#0009] active:cursor-grabbing"
				onKeyDown={(event) => {
					const delta = arrows[event.key];
					if (!delta || !(event.target instanceof HTMLElement)) {
						return;
					}
					event.preventDefault();
					const step = event.shiftKey ? 0.05 : 0.005;
					change(
						event.target.dataset.handle ?? "move",
						delta[0] * source[0] * step,
						delta[1] * source[1] * step,
					);
				}}
			>
				<button
					type="button"
					aria-label="Move crop"
					className="absolute inset-0 cursor-[inherit] focus-visible:outline-2 focus-visible:outline-white"
				/>

				{corners.map(([handle, label, left, top, cursor]) => (
					<button
						key={handle}
						type="button"
						data-handle={handle}
						aria-label={`Resize crop ${label}`}
						className="group absolute flex size-8 -translate-1/2 items-center justify-center outline-none"
						style={{ left: `${left}%`, top: `${top}%`, cursor }}
					>
						<span className="pointer-events-none size-2.5 border border-neutral-900 bg-white group-focus-visible:ring-2 group-focus-visible:ring-neutral-400/50" />
					</button>
				))}
			</div>
		</div>
	);
}
