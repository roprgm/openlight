import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { useStore } from "zustand";
import { EditorActions } from "@/app/editor/actions";
import { modes, useMode } from "@/app/editor/modes";
import { useRenderer } from "@/components/editor/pipeline";
import {
	PanelContent,
	useDocument,
	useScene,
} from "@/components/editor/session";
import Button from "@/components/ui/button";
import type { EffectLayer } from "@/core/document";
import {
	AdjustmentControls,
	TemperatureControls,
} from "@/features/adjustments/controls";
import { ColorMixerControls } from "@/features/color-mixer/controls";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import { EffectControls } from "@/features/layers/controls";
import { useGradientTool } from "@/features/layers/gradient-tool";
import { setToneCurve } from "@/features/tone-curves/edits";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import { VignetteControls } from "@/features/vignette/controls";
import { WhiteBalanceControls } from "@/features/white-balance/controls";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { ClippingControls } from "./clipping-controls";

const histogramColors = ["#f25445", "#6bd175", "#5c8ffa"] as const;
const curveHistogramColors = ["#a3a3a3"] as const;

function ColorTemperatureControls() {
	const document = useDocument();
	const source = useScene((scene) => scene.image.source);
	if (document.resources.get(source).raw) {
		return <WhiteBalanceControls />;
	}
	return <TemperatureControls />;
}

function ToneCurvesPanel({
	histogram,
}: {
	histogram: ReturnType<typeof createHistogram>;
}) {
	const renderer = useRenderer();
	const toneCurve = useScene((scene) => scene.image.toneCurve);
	const document = useDocument();
	return (
		<ToneCurves
			points={toneCurve}
			onChange={(points) => setToneCurve(document, points)}
		>
			<Histogram
				histogram={histogram}
				image={renderer.inputImage}
				subscribe={renderer.subscribe}
				colors={curveHistogramColors}
				working
				fillOpacity={0.65}
				aria-label="input histogram"
				className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
			/>
		</ToneCurves>
	);
}

function SelectedControls({
	layer,
	histogram,
}: {
	layer: EffectLayer | undefined;
	histogram: ReturnType<typeof createHistogram>;
}) {
	if (layer) {
		return (
			<>
				<EffectControls layer={layer} />
				{layer.kind === "vignette" && (
					<VignetteControls id={layer.id} vignette={layer.vignette} />
				)}
			</>
		);
	}
	return (
		<AdjustmentControls
			curves={<ToneCurvesPanel histogram={histogram} />}
			colorMixer={<ColorMixerControls />}
			temperature={<ColorTemperatureControls />}
		/>
	);
}

export function AdjustPanel() {
	const gpu = useGpu();
	const document = useDocument();
	const gesture = useEditGesture(document.history);
	const selected = useStore(document.selection, (state) => state.layerId);
	const layer = useScene((scene) =>
		scene.layers.find((layer) => layer.id === selected),
	);
	const name = layer?.name ?? "Original · Develop";
	const tool = useGradientTool();
	const { setMode } = useMode();
	const renderer = useRenderer();
	const histogram = useMemo(() => createHistogram(gpu), [gpu]);
	useEffect(() => () => histogram.dispose(), [histogram]);
	return (
		<PanelContent>
			<div className="flex min-h-0 flex-1 flex-col divide-y divide-black">
				<div className="flex items-center justify-between gap-2 border-b border-black px-3 py-2">
					<h2 className="truncate text-xs font-medium text-neutral-200">
						{name}
					</h2>
					<Button
						variant="ghost"
						className="shrink-0 px-2"
						title="Draw a linear gradient (G)"
						onClick={() => {
							setMode(modes[0]);
							tool.draw();
						}}
					>
						Linear gradient
					</Button>
				</div>
				<div
					{...gesture}
					className="min-h-0 flex-1 divide-y divide-black overflow-y-auto"
				>
					<section className="relative bg-neutral-900 p-0.5 pb-0">
						<ClippingControls />
						<Histogram
							histogram={histogram}
							image={renderer.outputImage}
							subscribe={renderer.subscribe}
							colors={histogramColors}
							fillOpacity={0.2}
							className="h-30 w-full"
							aria-label="output histogram"
						/>
					</section>
					<SelectedControls layer={layer} histogram={histogram} />
				</div>
				<EditorActions />
			</div>
		</PanelContent>
	);
}
