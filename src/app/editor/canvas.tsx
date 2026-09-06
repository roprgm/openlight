import { useStore } from "zustand";
import { useDocument, useScene } from "@/app/document/provider";
import { ImageView } from "@/components/image-view";
import { type Camera, usePanZoom } from "@/hooks/use-pan-zoom";
import { ComparisonDivider } from "./comparison-divider";
import { useRenderer } from "./renderer/provider";

export function EditorCanvas({ state }: { state: Camera }) {
	const camera = usePanZoom(
		state,
		useScene((scene) => scene.size),
	);
	const preview = useStore(useDocument().preview);
	const renderer = useRenderer();
	return (
		<ImageView
			camera={camera}
			subscribe={renderer.subscribe}
			draw={(frame, canvas) =>
				renderer.draw(frame, canvas, camera.view, preview, camera.viewport)
			}
			overlay={<ComparisonDivider />}
		/>
	);
}
