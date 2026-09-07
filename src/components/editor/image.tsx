import { useEffect, useMemo } from "react";
import { useCanvas, useFrame, useGpu } from "vgpu-react";
import { useStore } from "zustand";
import { fitScale } from "@/hooks/use-pan-zoom";
import { createDisplay } from "@/lib/image-display";
import type { ImageFrame } from "@/lib/image-frame/geometry";
import { useRenderer } from "./pipeline";
import { useDocument } from "./session";
import { useViewport } from "./viewport";

type Output = "fullImage" | "inputImage" | "outputImage" | "originalImage";

/** Mount a pipeline output; a supplied frame places the full source behind it. */
export function Image({
	image = "outputImage",
	geometry,
	original,
}: {
	image?: Output;
	geometry?: ImageFrame;
	original?: Output;
}) {
	const gpu = useGpu();
	const canvas = useCanvas();
	const camera = useViewport();
	const preview = useStore(useDocument().preview);
	const renderer = useRenderer();
	const display = useMemo(() => createDisplay(gpu), [gpu]);
	const render = useFrame((frame) => {
		const before = original && renderer[original]();
		const source =
			preview.comparison === "original" && before ? before : renderer[image]();
		const size = geometry?.size ?? source.size;
		const view = {
			...camera.view,
			zoom: camera.scale / (fitScale(size, camera.viewport) || 1),
		};
		display(frame, canvas, source, {
			view,
			viewport: camera.viewport,
			frame: geometry,
			original: before,
			split: preview.comparison === "split" ? preview.split : -1,
			clipping: preview,
		});
	});
	useEffect(() => renderer.subscribe(render), [renderer, render]);
	useEffect(() => render(), [render, camera, preview, geometry]);
	return null;
}
