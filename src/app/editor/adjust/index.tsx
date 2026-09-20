import { useCallback, useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { useStore } from "zustand";
import { PanelHeader } from "@/components/editor/panel";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { adjustmentTarget, type Layer, type ToneCurve } from "@/core/document";
import { AdjustmentControls } from "@/features/adjustments/controls";
import { ColorMixerControls } from "@/features/color-mixer/controls";
import { DetailsControls } from "@/features/details/controls";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import { setExposure } from "@/features/layers/edits";
import { setToneCurve } from "@/features/tone-curves/edits";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import { VignetteControls } from "@/features/vignette/controls";
import { WhiteBalanceControls } from "@/features/white-balance/controls";
import { useEditGesture } from "@/hooks/use-edit-gesture";

const curveHistogramColors = ["#a3a3a3"] as const;

function CurveInputHistogram({ id }: { id: string }) {
	const gpu = useGpu();
	const renderer = useRenderer();
	const histogram = useMemo(() => createHistogram(gpu), [gpu]);
	const image = useCallback(() => renderer.inputImage(id), [renderer, id]);
	useEffect(() => () => histogram.dispose(), [histogram]);
	return (
		<Histogram
			histogram={histogram}
			image={image}
			subscribe={renderer.subscribe}
			colors={curveHistogramColors}
			working
			fillOpacity={0.65}
			aria-label="curve input histogram"
			className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
		/>
	);
}

function LayerCurve({ id, toneCurve }: { id: string; toneCurve: ToneCurve }) {
	const document = useDocument();
	return (
		<div className="px-3 pb-3">
			<hr className="mb-3 border-black/50" />
			<ToneCurves
				points={toneCurve}
				onChange={(points) => setToneCurve(document, points, id)}
			>
				<CurveInputHistogram id={id} />
			</ToneCurves>
		</div>
	);
}

function SelectedControls({ layer }: { layer: Layer }) {
	const document = useDocument();
	switch (layer.kind) {
		case "details":
			return <DetailsControls id={layer.id} details={layer.details} />;
		case "image":
			return (
				<>
					<AdjustmentControls
						id={layer.id}
						adjustments={layer.adjustments}
						temperature={
							document.resources.get(layer.source).raw && (
								<WhiteBalanceControls />
							)
						}
					/>
					<LayerCurve id={layer.id} toneCurve={layer.toneCurve} />
				</>
			);
		case "color-mixer":
			return <ColorMixerControls id={layer.id} mixer={layer.colorMixer} />;
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
				<>
					<AdjustmentControls id={layer.id} adjustments={layer.adjustments} />
					<LayerCurve id={layer.id} toneCurve={layer.toneCurve} />
				</>
			);
	}
}

export function AdjustPanel() {
	const document = useDocument();
	const gesture = useEditGesture(document.history);
	const selected = useStore(document.selection, (state) => state.layerId);
	const target = useScene(
		(scene) => adjustmentTarget(scene.layers, selected) ?? scene.layers[0],
	);
	return (
		<div {...gesture}>
			<PanelHeader title="Adjustments" />
			<SelectedControls layer={target} />
		</div>
	);
}
