import { Canvas } from "vgpu-react";
import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";
import { CanvasRenderer } from "@/app/editor/renderer";
import { orientedSize } from "@/features/crop/geometry";
import { CropOverlay } from "@/features/crop/overlay";
import { updateCrop } from "./actions";

const fit = { zoom: 1, pan: [0, 0] as const };

export function CropCanvas() {
	const document = useDocument();
	const crop = useStore(document.preview, (state) => state.crop);
	if (!crop) {
		return null;
	}
	const image = document.resources.get(document.scene.getState().source).image;
	const size = orientedSize(image.size, crop.geometry.rotation);
	const ratio = crop.aspect && (crop.aspect * size[1]) / size[0];
	return (
		<section
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-6"
			aria-label="Crop canvas"
		>
			<div className="relative size-full">
				<Canvas className="size-full">
					<CanvasRenderer view={fit} />
				</Canvas>
				<CropOverlay
					size={size}
					rect={crop.geometry}
					ratio={ratio}
					onChange={(rect) => updateCrop(document, rect)}
				/>
			</div>
		</section>
	);
}
