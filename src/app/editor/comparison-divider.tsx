import type { PointerEvent } from "react";
import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";

export function ComparisonDivider() {
	const { preview } = useDocument();
	const { comparison, split } = useStore(preview);
	if (comparison !== "split") {
		return null;
	}
	const move = (position: number) =>
		preview.setState({ split: Math.max(0, Math.min(1, position)) });
	function drag(event: PointerEvent<HTMLDivElement>) {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
			return;
		}
		const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
		if (bounds) {
			move((event.clientX - bounds.left) / bounds.width);
		}
	}
	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label="Before and after divider"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(split * 100)}
			aria-valuetext={`${Math.round(split * 100)}% original`}
			aria-orientation="horizontal"
			className="absolute inset-y-0 z-10 flex w-8 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center outline-none group"
			style={{ left: `${split * 100}%` }}
			onPointerDown={(event) => {
				if (event.button !== 0) {
					return;
				}
				event.stopPropagation();
				event.currentTarget.focus();
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={drag}
			onPointerUp={(event) =>
				event.currentTarget.releasePointerCapture(event.pointerId)
			}
			onDoubleClick={(event) => {
				event.stopPropagation();
				move(0.5);
			}}
			onKeyDown={(event) => {
				const step = event.shiftKey ? 0.1 : 0.01;
				const positions: Record<string, number> = {
					ArrowLeft: split - step,
					ArrowRight: split + step,
					Home: 0,
					End: 1,
				};
				if (!(event.key in positions)) {
					return;
				}
				event.preventDefault();
				move(positions[event.key]);
			}}
		>
			<div className="absolute inset-y-0 w-px bg-white/90 shadow-[0_0_3px_#000]" />
			<span className="absolute top-4 right-6 rounded bg-black/50 px-2 py-1 text-[10px] text-white">
				Before
			</span>
			<span className="absolute top-4 left-6 rounded bg-black/50 px-2 py-1 text-[10px] text-white">
				After
			</span>
			<span className="relative flex size-7 items-center justify-center rounded-full border border-white/80 bg-neutral-900/80 text-white shadow-md group-focus-visible:ring-2 group-focus-visible:ring-white">
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					className="size-4"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
				>
					<path d="m7 6-4 4 3 4m6-8 3 4-3 4" />
				</svg>
			</span>
		</div>
	);
}
