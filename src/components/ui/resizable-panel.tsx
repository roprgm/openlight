import { cn } from "cn";
import { type ComponentProps, type PointerEvent, useState } from "react";

type ResizablePanelProps = ComponentProps<"aside"> & {
	width?: number;
	min?: number;
	max?: number;
};

/** Bottom half on mobile; right-side panel with a draggable left edge on desktop. */
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
			className={cn(
				"relative h-1/2 shrink-0 bg-neutral-800 shadow-ridge max-md:w-full! max-md:border-t max-md:border-neutral-600 md:h-auto",
				className,
			)}
			style={{ width, ...style }}
			{...props}
		>
			<div
				className="absolute inset-y-0 -left-1 hidden w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1 after:w-px after:bg-black hover:after:bg-neutral-600 after:transition-colors after:duration-200 md:block"
				onPointerDown={(event) =>
					event.currentTarget.setPointerCapture(event.pointerId)
				}
				onPointerMove={resize}
			/>
			{children}
		</aside>
	);
}
