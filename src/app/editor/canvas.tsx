import type { Ref } from "react";
import { Canvas } from "vgpu-react";
import { useDocument, useScene } from "@/app/document/provider";
import { CropOverlay } from "@/features/crop/overlay";
import { type CropViewHandle, useCropView } from "@/features/crop/view";
import { ComparisonDivider } from "./comparison-divider";
import { CanvasRenderer } from "./renderer";

export function EditorCanvas({ ref: canvasRef }: { ref: Ref<CropViewHandle> }) {
	const document = useDocument();
	const geometry = useScene((scene) => scene.geometry);
	const { ref, view, viewport, handlers, frame, panMode } = useCropView(
		document.crop,
		geometry,
		canvasRef,
	);
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
					<CanvasRenderer view={view} fitSize={viewport} />
				</Canvas>
				<CropOverlay tool={document.crop} frame={frame} />
			</div>
			<ComparisonDivider />
		</section>
	);
}
