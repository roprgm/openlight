import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { findLayer, type Gradient, type MaskLayer } from "@/core/document";
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
import { MaskOverlay } from "./mask-overlay";

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
	const layer = useScene((scene) => {
		const item = findLayer(scene.layers, selected);
		return item?.kind === "mask" ? item : undefined;
	});
	const mask = layer?.mask;
	const sourceId = useScene((scene) => scene.layers[0].source);
	const [width, height] = document.resources.get(sourceId).image.size;
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
	function dismiss() {
		if (dragging.current || tool.target) {
			cancel();
			return;
		}
		if (tool.overlay === "new" && mask) {
			deleteLayer(document, selected);
		}
		tool.setOverlay("hidden");
	}
	function toggleOverlay() {
		tool.setOverlay(tool.overlay === "hidden" ? "shown" : "hidden");
	}
	useShortcuts({
		escape: dismiss,
		...(tool.overlay === "hidden"
			? {}
			: { enter: () => tool.setOverlay("hidden") }),
		...(mask ? { o: toggleOverlay, delete: remove, backspace: remove } : {}),
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
	function documentTransform() {
		const [ax, ay] = outputOffset(frame, camera.scale, 0);
		const [bx, by] = outputOffset(frame, 0, camera.scale);
		const [ox, oy] = screenPoint([0, 0]);
		return `matrix(${ax} ${ay} ${bx} ${by} ${ox} ${oy})`;
	}
	function imageRect() {
		const shown = [frame.size[0] * camera.scale, frame.size[1] * camera.scale];
		return {
			x: camera.viewport[0] / 2 + camera.view.pan[0] - shown[0] / 2,
			y: camera.viewport[1] / 2 + camera.view.pan[1] - shown[1] / 2,
			width: shown[0],
			height: shown[1],
		};
	}
	const visible = draft ?? mask;
	const preview =
		!!draft || dragCursor !== undefined || tool.overlay !== "hidden";
	const modifiers = draft
		? []
		: (layer?.children.filter(
				(child): child is MaskLayer =>
					child.kind === "mask" && child.visible && child.opacity > 0,
			) ?? []);
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
			{visible && preview && !camera.panMode && (
				<MaskOverlay
					mask={visible}
					modifiers={modifiers}
					size={[width, height]}
					transform={documentTransform()}
					clip={imageRect()}
				/>
			)}
			{visible && !camera.panMode && (
				<GradientGuides
					mask={visible}
					screen={screenPoint}
					extent={Math.hypot(...camera.viewport)}
				/>
			)}
			{tool.overlay === "new" && !tool.target && (
				<p className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-xs text-white">
					Adjust the mask · Enter to keep · Esc to remove · O toggles overlay
				</p>
			)}
			{tool.target && (
				<p className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-xs text-white">
					Drag to draw · Shift to constrain · Esc to cancel
				</p>
			)}
		</div>
	);
}
