import { type ReactNode, useEffect } from "react";
import type { Frame, Target } from "vgpu";
import { Canvas, useCanvas, useFrame } from "vgpu-react";
import type { usePanZoom } from "@/hooks/use-pan-zoom";

type Drawing = {
	draw: (frame: Frame, canvas: Target & { dpr: number }) => void;
	subscribe: (listener: () => void) => () => void;
};

function Drawing({ draw, subscribe }: Drawing) {
	const canvas = useCanvas();
	const render = useFrame((frame) => draw(frame, canvas));
	useEffect(() => subscribe(render), [render, subscribe]);
	useEffect(() => render(), [render, draw]);
	return null;
}

/** Shared viewport chrome and GPU output mounting. Viewers supply their own drawing. */
export function ImageView({
	camera,
	draw,
	subscribe,
	children,
	overlay,
}: Drawing & {
	camera: ReturnType<typeof usePanZoom>;
	children?: ReactNode;
	overlay?: ReactNode;
}) {
	return (
		<section
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-6"
			aria-label="Image canvas"
		>
			<div
				ref={camera.ref}
				{...camera.handlers}
				data-pan-mode={camera.panMode}
				className="relative size-full cursor-grab touch-none active:cursor-grabbing data-[pan-mode=true]:[&_*]:cursor-grab! data-[pan-mode=true]:active:[&_*]:cursor-grabbing!"
			>
				<Canvas className="absolute -inset-6 size-[calc(100%+3rem)]">
					<Drawing draw={draw} subscribe={subscribe} />
				</Canvas>
				{children}
			</div>
			{overlay}
		</section>
	);
}
