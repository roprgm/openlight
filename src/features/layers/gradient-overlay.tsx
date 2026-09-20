import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { findLayer, type Gradient } from "@/core/document";
import { outputOffset, type Point, sourceOffset } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { deleteLayer, setLayerMask } from "./edits";
import {
	drawGradient,
	type GradientHandle,
	gradientHandles,
	moveGradient,
} from "./gradient";
import { GradientGuides } from "./gradient-guides";
import { useGradientTool } from "./gradient-tool";

type Drag = {
	pointer: number;
	from: Point;
	to: Point;
	mask: Gradient;
	handle: GradientHandle | "new";
	id: string;
};

export function GradientOverlay() {
	const document = useDocument();
	const tool = useGradientTool();
	const camera = useViewport();
	const frame = useScene((scene) => scene.frame);
	const selected = useStore(document.selection, (state) => state.layerId);
	const mask = useScene((scene) => {
		const layer = findLayer(scene.layers, selected);
		return layer?.kind === "mask" ? layer.mask : undefined;
	});
	const [draft, setDraft] = useState<Gradient | null>(null);
	const dragging = useRef<Drag | null>(null);
	const [dragCursor, setDragCursor] = useState<string>();
	function cancel() {
		if (dragging.current && dragging.current.handle !== "new") {
			document.history.cancel();
		}
		dragging.current = null;
		setDraft(null);
		setDragCursor(undefined);
		tool.close();
	}
	useEffect(
		() => () => {
			if (dragging.current && dragging.current.handle !== "new") {
				document.history.cancel();
			}
		},
		[document],
	);
	function remove() {
		cancel();
		if (mask) {
			deleteLayer(document, selected);
		}
	}
	useShortcuts({
		escape: cancel,
		...(mask ? { delete: remove, backspace: remove } : {}),
	});
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
		const [x, y] = outputOffset(
			frame,
			point[0] - frame.center[0],
			point[1] - frame.center[1],
		);
		return [
			camera.viewport[0] / 2 + camera.view.pan[0] + x * camera.scale,
			camera.viewport[1] / 2 + camera.view.pan[1] + y * camera.scale,
		];
	}
	function start(event: PointerEvent<HTMLDivElement>) {
		if (event.button !== 0 || !event.isPrimary || camera.panMode) {
			return;
		}
		const target =
			event.target instanceof Element
				? event.target
						.closest("[data-gradient-handle]")
						?.getAttribute("data-gradient-handle")
				: null;
		const handle = gradientHandles.find((handle) => handle === target);
		if (!tool.target && (!mask || !handle)) {
			return;
		}
		const from = documentPoint(event);
		if (tool.target) {
			dragging.current = {
				pointer: event.pointerId,
				from,
				to: from,
				mask: drawGradient(tool.target.shape, from, from),
				handle: "new",
				id: selected,
			};
			setDraft(dragging.current.mask);
		} else if (mask && handle) {
			document.history.commit();
			document.history.begin();
			dragging.current = {
				pointer: event.pointerId,
				from,
				to: from,
				mask,
				handle,
				id: selected,
			};
		}
		const cursor =
			event.target instanceof Element
				? getComputedStyle(event.target).cursor
				: "grab";
		const activeCursor = cursor === "grab" ? "grabbing" : cursor;
		setDragCursor(tool.target ? "crosshair" : activeCursor);
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
	}
	function move(event: PointerEvent<HTMLDivElement>) {
		const drag = dragging.current;
		if (!drag || drag.pointer !== event.pointerId) {
			return;
		}
		const point = documentPoint(event);
		drag.to = point;
		if (drag.handle === "new") {
			const next = drawGradient(
				drag.mask.kind,
				drag.from,
				point,
				event.shiftKey,
			);
			drag.mask = next;
			setDraft(next);
		} else {
			setLayerMask(
				document,
				drag.id,
				moveGradient(drag.mask, drag.handle, drag.from, point),
			);
		}
	}
	function finish(event: PointerEvent<HTMLDivElement>) {
		const drag = dragging.current;
		if (!drag || drag.pointer !== event.pointerId) {
			return;
		}
		// Commit the last preview; pointerup must not reinterpret geometry or Shift.
		if (drag.handle === "new") {
			const point = drag.to;
			const distance =
				Math.hypot(point[0] - drag.from[0], point[1] - drag.from[1]) *
				camera.scale;
			if (distance >= 3 && tool.target) {
				tool.create(drag.mask, tool.target);
			}
		} else {
			document.history.commit();
		}
		dragging.current = null;
		setDraft(null);
		setDragCursor(undefined);
		tool.close();
		event.currentTarget.releasePointerCapture(event.pointerId);
	}
	const visible = draft ?? mask;
	const cursor = dragCursor ?? (tool.target ? "crosshair" : undefined);
	const pointerEvents =
		(tool.target || dragCursor) && !camera.panMode ? "auto" : "none";
	return (
		<div
			role="application"
			aria-label="Gradient mask canvas"
			className="absolute inset-0 touch-none data-[cursor=true]:[&_*]:cursor-[inherit]!"
			data-cursor={!!cursor}
			style={{ pointerEvents, cursor }}
			onDoubleClick={(event) => event.stopPropagation()}
			onPointerDown={start}
			onPointerMove={move}
			onPointerUp={finish}
			onPointerCancel={cancel}
			onLostPointerCapture={() => {
				if (dragging.current) {
					cancel();
				}
			}}
		>
			{visible && !camera.panMode && (
				<GradientGuides
					mask={visible}
					screen={screenPoint}
					extent={Math.hypot(...camera.viewport)}
				/>
			)}
			{tool.target && (
				<p className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-xs text-white">
					Drag to draw · Shift to constrain · Esc to cancel
				</p>
			)}
		</div>
	);
}
