import { type ComponentProps, useEffect, useMemo } from "react";
import { effect, sampler, type Target } from "vgpu";
import { useGpu } from "vgpu-react";
import { ImageView } from "@/components/image-view";
import ResizablePanel from "@/components/ui/resizable-panel";
import { type Camera, fitScale, usePanZoom } from "@/hooks/use-pan-zoom";
import { type Clipping, displayView } from "@/lib/image-display";
import {
	type CropDraft,
	cropSize,
	cropTransform,
	type Geometry,
	orientedSize,
} from "./geometry";
import { CropOverlay } from "./overlay";
import { CropPanel } from "./panel";
import shader from "./preview.wgsl";
import type { CropTool } from "./tool";

type CropViewProps = {
	tool: CropTool;
	crop: CropDraft;
	applied: Geometry;
	state: Camera;
	image: () => Target;
	subscribe: (listener: () => void) => () => void;
	clipping: Clipping;
	panel: ComponentProps<typeof ResizablePanel>;
};

/** A separate viewer: reveal the source around a fixed crop frame. */
export function CropView({
	tool,
	crop,
	applied,
	state,
	image,
	subscribe,
	clipping,
	panel,
}: CropViewProps) {
	const gpu = useGpu();
	const { geometry } = crop;
	const size = tool.size;
	const reference = useMemo(
		() =>
			orientedSize(
				cropSize(size, applied),
				geometry.rotation - applied.rotation,
			),
		[size, applied, geometry.rotation],
	);
	const camera = usePanZoom(state, reference, { constrain: false });
	const preview = useMemo(
		() =>
			effect(gpu, shader, {
				set: {
					sourceSampler: sampler(gpu, {
						magFilter: "linear",
						minFilter: "linear",
					}),
				},
			}),
		[gpu],
	);
	const output = cropSize(size, geometry);
	const scale = fitScale(reference, camera.viewport) * camera.view.zoom;
	const view = {
		...camera.view,
		zoom: scale / (fitScale(output, camera.viewport) || 1),
	};
	const frame = {
		width: output[0] * scale,
		height: output[1] * scale,
		marginLeft: camera.view.pan[0],
		marginTop: camera.view.pan[1],
	};
	function apply() {
		tool.apply();
		state.setState(state.getInitialState(), true);
	}
	function resetView() {
		const reference = orientedSize(cropSize(size, applied), -applied.rotation);
		camera.resetView({
			zoom:
				fitScale(size, camera.viewport) / fitScale(reference, camera.viewport),
			pan: [0, 0],
		});
	}
	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			if (
				event.isComposing ||
				event.repeat ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			) {
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				apply();
			}
			if (event.key === "Escape") {
				event.preventDefault();
				tool.cancel();
			}
		}
		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	}, [tool, state]);
	return (
		<>
			<ImageView
				camera={camera}
				subscribe={subscribe}
				draw={(frame, canvas) => {
					frame.pass(
						canvas,
						preview.set({
							source: image().color,
							transform: cropTransform(geometry, size),
							view: displayView(
								canvas,
								output,
								view,
								camera.viewport,
								clipping,
							),
						}),
					);
				}}
			>
				<CropOverlay tool={tool} crop={crop} frame={frame} />
			</ImageView>
			<ResizablePanel {...panel}>
				<CropPanel
					tool={tool}
					crop={crop}
					onApply={apply}
					onResetView={resetView}
				/>
			</ResizablePanel>
		</>
	);
}
