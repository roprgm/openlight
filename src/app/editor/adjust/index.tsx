import { useStore } from "zustand";
import {
	PanelContent,
	useDocument,
	useScene,
} from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { findLayer, type Layer, walkLayers } from "@/core/document";
import { AdjustmentControls } from "@/features/adjustments/controls";
import { ColorMixerControls } from "@/features/color-mixer/controls";
import { DetailsControls } from "@/features/details/controls";
import { setExposure } from "@/features/layers/edits";
import { setToneCurve } from "@/features/tone-curves/edits";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import { VignetteControls } from "@/features/vignette/controls";
import { WhiteBalanceControls } from "@/features/white-balance/controls";
import { useEditGesture } from "@/hooks/use-edit-gesture";

function SelectedControls({ layer }: { layer: Layer }) {
	const document = useDocument();
	switch (layer.kind) {
		case "details":
			return <DetailsControls id={layer.id} details={layer.details} />;
		case "image":
			return (
				<AdjustmentControls
					id={layer.id}
					adjustments={layer.adjustments}
					temperature={
						document.resources.get(layer.source).raw && <WhiteBalanceControls />
					}
				/>
			);
		case "color-mixer":
			return <ColorMixerControls id={layer.id} mixer={layer.colorMixer} />;
		case "curves":
			return (
				<div className="p-3">
					<ToneCurves
						points={layer.toneCurve}
						onChange={(points) => setToneCurve(document, points, layer.id)}
					/>
				</div>
			);
		case "vignette":
			return <VignetteControls id={layer.id} vignette={layer.vignette} />;
		case "exposure":
			return (
				<section className="p-3">
					<Slider
						label="Exposure"
						value={layer.exposure}
						min={-5}
						max={5}
						step={0.01}
						defaultValue={0}
						onChange={(value) => setExposure(document, layer.id, value)}
					/>
				</section>
			);
		case "mask":
			return (
				<AdjustmentControls id={layer.id} adjustments={layer.adjustments} />
			);
	}
}

export function AdjustPanel() {
	const document = useDocument();
	const gesture = useEditGesture(document.history);
	const selected = useStore(document.selection, (state) => state.layerId);
	const layer = useScene(
		(scene) => findLayer(scene.layers, selected) ?? scene.layers[0],
	);
	const parent = useScene((scene) =>
		walkLayers(scene.layers).find((item) =>
			item.children.some((child) => child.id === layer.id),
		),
	);
	// A child mask edits coverage; the parent owns the resulting adjustments.
	const target =
		layer.kind === "mask" && parent?.kind === "mask" ? parent : layer;
	return (
		<PanelContent>
			<div {...gesture}>
				<h2 className="flex h-10 items-center border-b border-black/50 px-3 text-xs font-medium text-neutral-200">
					Adjustments
				</h2>
				<SelectedControls layer={target} />
			</div>
		</PanelContent>
	);
}
