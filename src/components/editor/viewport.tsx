import { createContext, type ReactNode, useContext } from "react";
import { Canvas } from "vgpu-react";
import { Icon } from "@/components/icons/icon";
import Button from "@/components/ui/button";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import type { Point } from "@/lib/image-frame/geometry";
import { useEditorSession } from "./session";

const Viewport = createContext<ReturnType<typeof usePanZoom> | null>(null);
export function useViewport() {
	const viewport = useContext(Viewport);
	if (!viewport) {
		throw new Error("An editor viewport is required.");
	}
	return viewport;
}

/** Zoom as Photoshop counts it: 100% shows one image pixel per device pixel. */
function ZoomControl() {
	const { scale, zoomBy, resetView } = useViewport();
	const percent = Math.round(scale * devicePixelRatio * 100);
	return (
		<div className="absolute right-3 bottom-3">
			<div className="flex items-center rounded-full bg-neutral-900/65 p-0.5 shadow-md backdrop-blur-sm">
				<Button
					variant="ghost"
					aria-label="Zoom out"
					className="flex size-6 items-center justify-center rounded-full p-0"
					onClick={() => zoomBy(1 / 1.25)}
				>
					<Icon viewBox="0 0 20 20" className="size-3.5">
						<path d="M5 10h10" />
					</Icon>
				</Button>
				<Button
					variant="ghost"
					title="Fit to view"
					className="min-w-14 rounded-full px-1 py-0.5 text-neutral-200 tabular-nums"
					onClick={() => resetView()}
				>
					{percent}%
				</Button>
				<Button
					variant="ghost"
					aria-label="Zoom in"
					className="flex size-6 items-center justify-center rounded-full p-0"
					onClick={() => zoomBy(1.25)}
				>
					<Icon viewBox="0 0 20 20" className="size-3.5">
						<path d="M10 5v10M5 10h10" />
					</Icon>
				</Button>
			</div>
		</div>
	);
}

export function EditorViewport({
	size,
	constrain = true,
	children,
	overlay,
}: {
	size: Point;
	constrain?: boolean;
	children: ReactNode;
	overlay?: ReactNode;
}) {
	const { camera } = useEditorSession();
	const viewport = usePanZoom(camera, size, { constrain });
	return (
		<section
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-6"
			aria-label="Image canvas"
		>
			<Viewport value={viewport}>
				<div
					ref={viewport.ref}
					{...viewport.handlers}
					data-pan-mode={viewport.panMode}
					className="relative size-full cursor-grab touch-none active:cursor-grabbing data-[pan-mode=true]:[&_*]:cursor-grab! data-[pan-mode=true]:active:[&_*]:cursor-grabbing!"
				>
					<Canvas className="absolute -inset-6 size-[calc(100%+3rem)]">
						{children}
					</Canvas>
				</div>
				{overlay}
				<ZoomControl />
			</Viewport>
		</section>
	);
}
