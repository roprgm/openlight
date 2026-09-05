import { useEffect } from "react";
import { useCanvas, useFrame } from "vgpu-react";
import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";
import type { View } from "@/hooks/use-pan-zoom";
import { useRenderer } from "./provider";

type CanvasRendererProps = { view: View; fitSize: readonly number[] };

export function CanvasRenderer({ view, fitSize }: CanvasRendererProps) {
	const renderer = useRenderer();
	const preview = useStore(useDocument().preview);
	const canvas = useCanvas();
	const draw = useFrame((frame) =>
		renderer.draw(
			frame,
			canvas,
			view,
			preview,
			fitSize.map((value) => value * canvas.dpr),
		),
	);
	useEffect(() => {
		const unsubscribe = renderer.subscribe(draw);
		const observer = new ResizeObserver(draw);
		if (canvas.canvas instanceof HTMLCanvasElement) {
			observer.observe(canvas.canvas);
		}
		return () => {
			unsubscribe();
			observer.disconnect();
		};
	}, [renderer, canvas, draw]);
	useEffect(() => draw(), [draw, view, preview, fitSize]);
	return null;
}
