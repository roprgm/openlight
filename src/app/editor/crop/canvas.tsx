import { useMemo } from "react";
import { Canvas } from "vgpu-react";
import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";
import { CanvasRenderer } from "@/app/editor/renderer";
import { orientedSize } from "@/features/crop/geometry";
import { CropOverlay } from "@/features/crop/overlay";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import { updateCrop } from "./actions";

export function CropCanvas() {
	const document = useDocument();
	const crop = useStore(document.preview, (state) => state.crop);
	const image = document.resources.get(document.scene.getState().source).image;
	const rotation = crop?.geometry.rotation ?? 0;
	const size = useMemo(
		() => orientedSize(image.size, rotation),
		[image, rotation],
	);
	const { ref, view, handlers } = usePanZoom(size);
	if (!crop) {
		return null;
	}
	const ratio = crop.aspect && (crop.aspect * size[1]) / size[0];
	return (
		<section
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-6"
			aria-label="Crop canvas"
		>
			<div
				ref={ref}
				{...handlers}
				className="relative size-full cursor-grab touch-none active:cursor-grabbing"
			>
				<Canvas className="size-full">
					<CanvasRenderer view={view} />
				</Canvas>
				<CropOverlay
					size={size}
					view={view}
					rect={crop.geometry}
					ratio={ratio}
					onChange={(rect) => updateCrop(document, rect)}
				/>
			</div>
		</section>
	);
}
