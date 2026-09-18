import { type PointerEvent, useId, useRef, useState } from "react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import type { LinearGradient } from "@/core/document";
import { type Point, sourceOffset } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { addLayer, setLayerMask } from "./edits";
import { useGradientTool } from "./gradient-tool";

export function GradientOverlay() {
	const document = useDocument();
	const tool = useGradientTool();
	const camera = useViewport();
	const frame = useScene((scene) => scene.frame);
	const selected = useStore(document.selection, (state) => state.layerId);
	const mask = useScene(
		(scene) => scene.layers.find((layer) => layer.id === selected)?.mask,
	);
	const [draft, setDraft] = useState<LinearGradient | null>(null);
	const drawing = useRef<{ pointer: number; start: Point } | null>(null);
	const gradientId = useId();
	function cancel() {
		drawing.current = null;
		setDraft(null);
		tool.close();
	}
	useShortcuts({ escape: cancel });
	function documentPoint(event: PointerEvent): Point {
		const box = camera.ref.current?.getBoundingClientRect();
		if (!box) {
			return frame.center;
		}
		const offset = sourceOffset(
			frame,
			(event.clientX - box.left - box.width / 2 - camera.view.pan[0]) /
				camera.scale,
			(event.clientY - box.top - box.height / 2 - camera.view.pan[1]) /
				camera.scale,
		);
		return [frame.center[0] + offset[0], frame.center[1] + offset[1]];
	}
	function screenPoint(point: Point): Point {
		const angle = ((frame.rotation + frame.angle) * Math.PI) / 180;
		const dx = point[0] - frame.center[0];
		const dy = point[1] - frame.center[1];
		return [
			camera.viewport[0] / 2 +
				camera.view.pan[0] +
				((Math.cos(angle) * dx - Math.sin(angle) * dy) / frame.scale[0]) *
					camera.scale,
			camera.viewport[1] / 2 +
				camera.view.pan[1] +
				((Math.sin(angle) * dx + Math.cos(angle) * dy) / frame.scale[1]) *
					camera.scale,
		];
	}
	function start(event: PointerEvent<HTMLDivElement>) {
		if (
			!tool.target ||
			event.button !== 0 ||
			!event.isPrimary ||
			camera.panMode
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		document.history.commit();
		const point = documentPoint(event);
		drawing.current = { pointer: event.pointerId, start: point };
		setDraft({ start: point, end: point });
		event.currentTarget.setPointerCapture(event.pointerId);
	}
	function finish(event: PointerEvent<HTMLDivElement>) {
		const current = drawing.current;
		if (!current || current.pointer !== event.pointerId) {
			return;
		}
		const end = documentPoint(event);
		const mask = { start: current.start, end };
		if (
			Math.hypot(end[0] - current.start[0], end[1] - current.start[1]) *
				camera.scale >=
			3
		) {
			if (tool.target === "new") {
				addLayer(document, "exposure", mask);
			} else if (tool.target) {
				setLayerMask(document, tool.target, mask);
			}
		}
		cancel();
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}
	const active = Boolean(tool.target) && !camera.panMode;
	const visible = draft ?? mask;
	const startPoint = visible && screenPoint(visible.start);
	const endPoint = visible && screenPoint(visible.end);
	const pointerEvents = active ? "auto" : "none";
	return (
		<div
			role="application"
			aria-label="Gradient mask canvas"
			className="absolute inset-0 touch-none"
			style={{ pointerEvents, cursor: "crosshair" }}
			onPointerDown={start}
			onPointerMove={(event) => {
				if (drawing.current?.pointer === event.pointerId) {
					setDraft({ start: drawing.current.start, end: documentPoint(event) });
				}
			}}
			onPointerUp={finish}
			onPointerCancel={cancel}
			onLostPointerCapture={() => {
				if (drawing.current) {
					cancel();
				}
			}}
		>
			{startPoint && endPoint && (
				<svg
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 size-full overflow-hidden"
				>
					<defs>
						<linearGradient
							id={gradientId}
							gradientUnits="userSpaceOnUse"
							x1={startPoint[0]}
							y1={startPoint[1]}
							x2={endPoint[0]}
							y2={endPoint[1]}
						>
							<stop offset="0" stopColor="#fb7185" stopOpacity="0.35" />
							<stop offset="1" stopColor="#fb7185" stopOpacity="0" />
						</linearGradient>
					</defs>
					{tool.target && (
						<rect
							x={
								(camera.viewport[0] - frame.size[0] * camera.scale) / 2 +
								camera.view.pan[0]
							}
							y={
								(camera.viewport[1] - frame.size[1] * camera.scale) / 2 +
								camera.view.pan[1]
							}
							width={frame.size[0] * camera.scale}
							height={frame.size[1] * camera.scale}
							fill={`url(#${gradientId})`}
						/>
					)}
					<line
						x1={startPoint[0]}
						y1={startPoint[1]}
						x2={endPoint[0]}
						y2={endPoint[1]}
						stroke="#000"
						strokeWidth="3"
					/>
					<line
						x1={startPoint[0]}
						y1={startPoint[1]}
						x2={endPoint[0]}
						y2={endPoint[1]}
						stroke="white"
						strokeWidth="1"
					/>
					<circle
						cx={startPoint[0]}
						cy={startPoint[1]}
						r="5"
						fill="white"
						stroke="#171717"
					/>
					<circle
						cx={endPoint[0]}
						cy={endPoint[1]}
						r="5"
						fill="#171717"
						stroke="white"
					/>
				</svg>
			)}
			{tool.target && (
				<p className="pointer-events-none absolute top-3 left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-center text-xs text-white">
					Drag from full effect to no effect · Esc to cancel
				</p>
			)}
		</div>
	);
}
