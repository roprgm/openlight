import { useEffect } from "react";
import { useCanvas } from "vgpu-react";
import type { View } from "@/hooks/use-pan-zoom";
import { useRenderer } from "./provider";

type CanvasRendererProps = { view: View };

export default function CanvasRenderer({ view }: CanvasRendererProps) {
	const renderer = useRenderer();
	const canvas = useCanvas();
	useEffect(
		() => renderer.attachCanvas(canvas, view),
		[renderer, canvas, view],
	);
	return null;
}
