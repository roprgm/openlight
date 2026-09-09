import { useMemo } from "react";
import { useCanvas, useFrameLoop, useGpu } from "vgpu-react";
import { useStore } from "zustand";
import { Image } from "@/components/editor/image";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { fitScale } from "@/hooks/use-pan-zoom";
import { createDisplay } from "@/lib/image-display";
import { getSelection, type Selection } from "./session";

function SelectedImage({ selection }: { selection: Selection }) {
	const gpu = useGpu();
	const canvas = useCanvas();
	const camera = useViewport();
	const renderer = useRenderer();
	const preview = useStore(useDocument().preview);
	const display = useMemo(() => createDisplay(gpu), [gpu]);
	const open = useStore(selection.state, (s) => s.open);
	useFrameLoop((frame) => {
		const engine = selection.engine();
		engine?.preview(frame);
		const image =
			!open && preview.comparison === "original"
				? renderer.originalImage()
				: renderer.outputImage();
		display(frame, canvas, image, {
			view: {
				...camera.view,
				zoom: camera.scale / (fitScale(image.size, camera.viewport) || 1),
			},
			viewport: camera.viewport,
			original: renderer.originalImage(),
			split: !open && preview.comparison === "split" ? preview.split : -1,
			clipping: open ? undefined : preview,
		});
		engine?.draw(frame, canvas, { scale: camera.scale, pan: camera.view.pan });
	});
	return null;
}

/** Mount the document's mask over its image; the adjustment editor retains it after Apply. */
export function SelectionImage() {
	const selection = getSelection(useGpu(), useDocument());
	const visible = useStore(selection.state, (s) => s.open || s.count > 0);
	if (visible) return <SelectedImage selection={selection} />;
	return <Image original="originalImage" />;
}
