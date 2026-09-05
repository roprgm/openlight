import { useMemo } from "react";
import { Canvas } from "vgpu-react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/app/document/provider";
import { orientedSize } from "@/features/crop/geometry";
import { CropOverlay } from "@/features/crop/overlay";
import { revealCrop } from "@/features/crop/view";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import { ComparisonDivider } from "./comparison-divider";
import { updateCrop } from "./crop";
import { CanvasRenderer } from "./renderer";

export function EditorCanvas({ size }: { size: readonly [number, number] }) {
	const document = useDocument();
	const crop = useStore(document.preview, (state) => state.crop);
	const geometry = useScene((scene) => scene.geometry);
	const image = document.resources.get(document.scene.getState().source).image;
	const rotation = crop?.geometry.rotation ?? geometry.rotation;
	const content = useMemo(
		() => orientedSize(size, rotation - geometry.rotation),
		[size, rotation, geometry.rotation],
	);
	const { ref, view, viewport, handlers, panBy } = usePanZoom(content, {
		constrain: !crop,
	});
	const display = crop
		? revealCrop(view, viewport, image.size, geometry, rotation)
		: view;
	const fullSize = orientedSize(image.size, rotation);
	return (
		<section
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-6"
			aria-label="Image canvas"
		>
			<div
				ref={ref}
				{...handlers}
				className="relative size-full cursor-grab touch-none active:cursor-grabbing"
			>
				<Canvas className="size-full">
					<CanvasRenderer view={display} />
				</Canvas>
				{crop && (
					<CropOverlay
						size={fullSize}
						view={display}
						viewport={viewport}
						geometry={crop.geometry}
						ratio={crop.aspect && (crop.aspect * fullSize[1]) / fullSize[0]}
						onChange={(change) => updateCrop(document, change)}
						onPan={panBy}
					/>
				)}
				<ComparisonDivider />
			</div>
		</section>
	);
}
