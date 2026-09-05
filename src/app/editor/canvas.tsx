import { type Ref, useImperativeHandle, useMemo } from "react";
import { Canvas } from "vgpu-react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/app/document/provider";
import { orientedSize } from "@/features/crop/geometry";
import { CropOverlay } from "@/features/crop/overlay";
import { fitCropView, revealCrop } from "@/features/crop/view";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import { ComparisonDivider } from "./comparison-divider";
import { updateCrop } from "./crop";
import { CanvasRenderer } from "./renderer";

export type EditorCanvasHandle = {
	resetView: () => void;
	fitView: () => void;
};

export function EditorCanvas({
	size,
	ref: canvasRef,
}: {
	size: readonly [number, number];
	ref: Ref<EditorCanvasHandle>;
}) {
	const document = useDocument();
	const crop = useStore(document.preview, (state) => state.crop);
	const geometry = useScene((scene) => scene.geometry);
	const image = document.resources.get(document.scene.getState().source).image;
	const rotation = crop?.geometry.rotation ?? geometry.rotation;
	const content = useMemo(
		() => orientedSize(size, rotation - geometry.rotation),
		[size, rotation, geometry.rotation],
	);
	const { ref, view, viewport, handlers, panBy, resetView, panMode } =
		usePanZoom(content, {
			constrain: !crop,
		});
	useImperativeHandle(canvasRef, () => ({
		fitView: resetView,
		resetView: () => resetView(fitCropView(viewport, image.size, geometry)),
	}));
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
				data-pan-mode={panMode}
				className="relative size-full cursor-grab touch-none active:cursor-grabbing data-[pan-mode=true]:[&_*]:cursor-grab! data-[pan-mode=true]:active:[&_*]:cursor-grabbing!"
			>
				<Canvas className="absolute -inset-6 size-[calc(100%+3rem)]">
					<CanvasRenderer view={display} fitSize={viewport} />
				</Canvas>
				{crop && (
					<CropOverlay
						size={image.size}
						view={display}
						viewport={viewport}
						geometry={crop.geometry}
						ratio={crop.aspect && (crop.aspect * fullSize[1]) / fullSize[0]}
						onChange={(change) => updateCrop(document, change)}
						onPan={panBy}
					/>
				)}
			</div>
			<ComparisonDivider />
		</section>
	);
}
