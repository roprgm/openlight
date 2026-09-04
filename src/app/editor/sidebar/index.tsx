import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { useRenderer } from "@/app/editor/renderer/provider";
import { useScene } from "@/app/scene";
import ResizablePanel from "@/components/ui/resizable-panel";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import AdjustmentControls from "./adjustment-controls";
import ExportButton from "./export-button";

const histogramColors = ["#f25445", "#6bd175", "#5c8ffa"] as const;
const curveHistogramColors = ["#a3a3a3"] as const;

function ToneCurvesPanel({
	histogram,
}: {
	histogram: ReturnType<typeof createHistogram>;
}) {
	const renderer = useRenderer();
	const curve = useScene((scene) => scene.curve);
	const setCurve = useScene((scene) => scene.setCurve);
	return (
		<ToneCurves points={curve} onChange={setCurve}>
			<Histogram
				histogram={histogram}
				image={renderer.inputImage}
				colors={curveHistogramColors}
				working
				fillOpacity={0.65}
				aria-label="input histogram"
				className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
			/>
		</ToneCurves>
	);
}

export function Sidebar() {
	const gpu = useGpu();
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
							colors={histogramColors}
							fillOpacity={0.2}
							className="h-30 w-full"
							aria-label="output histogram"
						/>
					</section>
					<AdjustmentControls />
					<ToneCurvesPanel histogram={histogram} />
				</div>
				<ExportButton />
			</div>
		</ResizablePanel>
	);
}
