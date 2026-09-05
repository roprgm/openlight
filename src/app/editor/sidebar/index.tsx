import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { setToneCurve } from "@/app/document/edits";
import { useDocument, useSelectedLayer } from "@/app/document/provider";
import { ExportButton } from "@/app/editor/export/export-button";
import { HistoryControls } from "@/app/editor/history";
import { useRenderer } from "@/app/editor/renderer/provider";
import type { ImageLayer } from "@/app/scene";
import ResizablePanel from "@/components/ui/resizable-panel";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import AdjustmentControls from "./adjustment-controls";
import { Layers } from "./layers";

const histogramColors = ["#f25445", "#6bd175", "#5c8ffa"] as const;
const curveHistogramColors = ["#a3a3a3"] as const;

function ToneCurvesPanel({
	histogram,
	layer,
}: {
	histogram: ReturnType<typeof createHistogram>;
	layer: ImageLayer;
}) {
	const renderer = useRenderer();
	const toneCurve = layer.toneCurve;
	const document = useDocument();
	return (
		<ToneCurves
			points={toneCurve}
			onChange={(points) => setToneCurve(document, points, layer.id)}
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

function LayerAdjustments({
	layer,
	histogram,
}: {
	layer: ImageLayer;
	histogram: ReturnType<typeof createHistogram>;
}) {
	const gesture = useEditGesture(useDocument().history);
	return (
		<div {...gesture} className="divide-y divide-black">
			<AdjustmentControls layer={layer} />
			<ToneCurvesPanel layer={layer} histogram={histogram} />
		</div>
	);
}

export function Sidebar() {
	const gpu = useGpu();
	const layer = useSelectedLayer();
	const renderer = useRenderer();
	const histogram = useMemo(() => createHistogram(gpu), [gpu]);
	useEffect(() => () => histogram.dispose(), [histogram]);
	return (
		<ResizablePanel>
			<div className="flex h-full flex-col divide-y divide-black">
				<div className="min-h-0 flex-1 divide-y divide-black overflow-y-auto">
					<section className="bg-neutral-900 p-0.5 pb-0">
						<Histogram
							histogram={histogram}
							image={renderer.outputImage}
							premultiplied
							subscribe={renderer.subscribe}
							colors={histogramColors}
							fillOpacity={0.2}
							className="h-30 w-full"
							aria-label="output histogram"
						/>
					</section>
					{layer && (
						<LayerAdjustments
							key={layer.id}
							layer={layer}
							histogram={histogram}
						/>
					)}
				</div>
				<Layers />
				<div className="flex shrink-0 items-center gap-2 bg-neutral-900 px-2 py-1.5">
					<HistoryControls />
					<ExportButton />
				</div>
			</div>
		</ResizablePanel>
	);
}
