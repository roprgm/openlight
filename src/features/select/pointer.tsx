import { type PointerEvent, useRef } from "react";
import { useViewport } from "@/components/editor/viewport";
import type { Selection } from "./session";

/** outputImage already has the scene frame applied; invert only its displayed camera rectangle. */
export function SelectionPointer({
	selection,
	size,
}: {
	selection: Selection;
	size: readonly [number, number];
}) {
	const camera = useViewport();
	const drag = useRef<{
		id: number;
		x: number;
		y: number;
		tolerance: number;
	} | null>(null);
	function start(event: PointerEvent<HTMLDivElement>) {
		const { status } = selection.state.getState();
		if (
			camera.panMode ||
			event.button !== 0 ||
			!event.isPrimary ||
			status === "preparing" ||
			status === "error"
		)
			return;
		const box = camera.ref.current?.getBoundingClientRect();
		if (!box || !camera.scale) return;
		const point = [
			(event.clientX - box.left - box.width / 2 - camera.view.pan[0]) /
				camera.scale +
				size[0] / 2,
			(event.clientY - box.top - box.height / 2 - camera.view.pan[1]) /
				camera.scale +
				size[1] / 2,
		] as const;
		if (point.some((value, i) => value < 0 || value >= size[i])) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		let operation: "replace" | "add" | "subtract" | "intersect" = "replace";
		if (event.shiftKey) operation = "add";
		if (event.altKey) operation = "subtract";
		if (event.ctrlKey || event.metaKey) operation = "intersect";
		selection.begin(point, operation);
		drag.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			tolerance: selection.state.getState().options.tolerance,
		};
	}
	function move(event: PointerEvent<HTMLDivElement>) {
		const gesture = drag.current;
		if (
			!gesture ||
			gesture.id !== event.pointerId ||
			selection.state.getState().status !== "preview"
		)
			return;
		const distance = Math.hypot(
			event.clientX - gesture.x,
			event.clientY - gesture.y,
		);
		selection.configure({
			tolerance: Math.min(2, gesture.tolerance + distance / 400),
		});
	}
	function end(event: PointerEvent<HTMLDivElement>) {
		if (drag.current?.id !== event.pointerId) return;
		drag.current = null;
		if (selection.state.getState().status === "preview")
			void selection.commit();
	}
	function cancel() {
		if (!drag.current) return;
		drag.current = null;
		selection.cancel();
	}
	return (
		<div
			role="application"
			aria-label="Magic Wand selection"
			className="absolute -inset-6 cursor-crosshair touch-none"
			onPointerDown={start}
			onPointerMove={move}
			onPointerUp={end}
			onPointerCancel={cancel}
			onLostPointerCapture={cancel}
			onDoubleClick={(event) => event.stopPropagation()}
		/>
	);
}
