import { cn } from "cn";
import { type ComponentProps, type PointerEvent, useState } from "react";

type ResizablePanelProps = ComponentProps<"aside"> & {
	width?: number;
	min?: number;
	max?: number;
};

/** Right-side panel resized by dragging its left edge. */
export default function ResizablePanel({
	width: initial = 288,
	min = 240,
	max = 400,
	className,
	style,
	children,
	...props
}: ResizablePanelProps) {
	const [width, setWidth] = useState(initial);
	const resize = (event: PointerEvent) =>
		event.buttons === 1 &&
		setWidth((width) => Math.min(max, Math.max(min, width - event.movementX)));

	return (
		<aside
			className={cn("relative shrink-0", className)}
			style={{ width, ...style }}
			{...props}
		>
			<div
				className="absolute inset-y-0 -left-1 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1 after:w-px after:bg-neutral-800 hover:after:bg-neutral-700 after:transition-colors after:duration-200"
				onPointerDown={(event) =>
					event.currentTarget.setPointerCapture(event.pointerId)
				}
				onPointerMove={resize}
			/>
			{children}
		</aside>
	);
}
