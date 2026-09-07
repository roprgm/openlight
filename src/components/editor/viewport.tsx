import { createContext, type ReactNode, useContext } from "react";
import { Canvas } from "vgpu-react";
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
			</Viewport>
		</section>
	);
}
