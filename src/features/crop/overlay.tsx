import { type PointerEvent, useEffect, useRef, useState } from "react";
import { dragRect, type Rect } from "./geometry";

type CropOverlayProps = {
	size: readonly [number, number];
	rect: Rect;
	ratio: number | null;
	onChange: (rect: Rect) => void;
};
const corners = [
	{ handle: "nw", label: "top left", x: 0, y: 0 },
	{ handle: "ne", label: "top right", x: 1, y: 0 },
	{ handle: "sw", label: "bottom left", x: 0, y: 1 },
	{ handle: "se", label: "bottom right", x: 1, y: 1 },
];

export function CropOverlay({ size, rect, ratio, onChange }: CropOverlayProps) {
	const ref = useRef<HTMLDivElement>(null);
	const drag = useRef<{
		rect: Rect;
		handle: string;
		x: number;
		y: number;
	} | null>(null);
	const [box, setBox] = useState([0, 0]);
	const [width, height] = size;
	useEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}
		const observer = new ResizeObserver(() => {
			const scale = Math.min(
				element.clientWidth / width,
				element.clientHeight / height,
				1 / devicePixelRatio,
			);
			setBox([width * scale, height * scale]);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [width, height]);
	function handle(event: PointerEvent<HTMLDivElement>) {
		if (event.button !== 0) {
			return;
		}
		const corner =
			event.target instanceof Element && event.target.closest("[data-handle]");
		drag.current = {
			rect,
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
		<div
			ref={ref}
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			<div
				className="absolute top-1/2 left-1/2 -translate-1/2"
				style={{ width: box[0], height: box[1] }}
			>
				<div
					role="application"
					aria-label="Crop selection"
					className="pointer-events-auto absolute cursor-move touch-none border border-white shadow-[0_0_0_9999px_#0009] outline-none focus-visible:ring-2 focus-visible:ring-white/50"
					style={{
						left: `${rect.x * 100}%`,
						top: `${rect.y * 100}%`,
						width: `${rect.width * 100}%`,
						height: `${rect.height * 100}%`,
					}}
					onPointerDown={handle}
					onPointerMove={(event) => {
						const current = drag.current;
						if (current) {
							onChange(
								dragRect(
									current.rect,
									current.handle,
									(event.clientX - current.x) / box[0],
									(event.clientY - current.y) / box[1],
									ratio,
								),
							);
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
						const step = event.shiftKey ? 0.05 : 0.005;
						onChange(
							dragRect(
								rect,
								corner,
								direction[0] * step,
								direction[1] * step,
								ratio,
							),
						);
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
							className="absolute flex size-8 -translate-1/2 items-center justify-center focus-visible:outline-2 focus-visible:outline-white"
							style={{
								left: `${x * 100}%`,
								top: `${y * 100}%`,
								cursor: x === y ? "nwse-resize" : "nesw-resize",
							}}
						>
							<span className="pointer-events-none size-2.5 border border-neutral-900 bg-white" />
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
