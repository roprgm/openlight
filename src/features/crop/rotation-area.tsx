import { type PointerEvent, type RefObject, useRef } from "react";

type RotationAreaProps = {
	selection: RefObject<HTMLDivElement | null>;
	angle: number;
	onChange: (angle: number) => void;
};

function distance(event: PointerEvent, bounds: DOMRect) {
	return Math.hypot(
		Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right),
		Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom),
	);
}

function bearing(event: PointerEvent, bounds: DOMRect) {
	return Math.atan2(
		event.clientY - bounds.top - bounds.height / 2,
		event.clientX - bounds.left - bounds.width / 2,
	);
}

/** Straighten by dragging around the frame, clear of the resize handles. */
export function RotationArea({
	selection,
	angle,
	onChange,
}: RotationAreaProps) {
	const drag = useRef<{
		bounds: DOMRect;
		bearing: number;
		angle: number;
	} | null>(null);
	return (
		<div
			className="pointer-events-auto absolute -inset-6 touch-none"
			onPointerDown={(event) => {
				const bounds = selection.current?.getBoundingClientRect();
				if (
					event.button !== 0 ||
					drag.current ||
					!bounds ||
					distance(event, bounds) < 50
				) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				drag.current = { bounds, bearing: bearing(event, bounds), angle };
			}}
			onPointerMove={(event) => {
				const current = drag.current;
				if (!current) {
					const bounds = selection.current?.getBoundingClientRect();
					event.currentTarget.style.cursor =
						bounds && distance(event, bounds) >= 50 ? "crosshair" : "inherit";
					return;
				}
				const delta = bearing(event, current.bounds) - current.bearing;
				const degrees =
					(Math.atan2(Math.sin(delta), Math.cos(delta)) * 180) / Math.PI;
				onChange(
					Math.max(
						-45,
						Math.min(45, Math.round((current.angle + degrees) * 10) / 10),
					),
				);
			}}
			onLostPointerCapture={() => {
				drag.current = null;
			}}
		/>
	);
}
