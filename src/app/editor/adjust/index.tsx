import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { EditorActions } from "@/app/editor/actions";
import { useRenderer } from "@/components/editor/pipeline";
import {
	PanelContent,
	useDocument,
	useScene,
} from "@/components/editor/session";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { setToneCurve } from "@/lib/editor/document/edits";
import AdjustmentControls from "./adjustment-controls";
import { ClippingControls } from "./clipping-controls";

const histogramColors = ["#f25445", "#6bd175", "#5c8ffa"] as const;
const curveHistogramColors = ["#a3a3a3"] as const;

function ToneCurvesPanel({
	histogram,
}: {
	histogram: ReturnType<typeof createHistogram>;
}) {
	const renderer = useRenderer();
	const toneCurve = useScene((scene) => scene.toneCurve);
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

export function AdjustPanel() {
	const gpu = useGpu();
	const document = useDocument();
	const gesture = useEditGesture(document.history);
	const renderer = useRenderer();
	const histogram = useMemo(() => createHistogram(gpu), [gpu]);
	useEffect(() => () => histogram.dispose(), [histogram]);
	return (
		<PanelContent>
			<div className="flex min-h-0 flex-1 flex-col divide-y divide-black">
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
					<AdjustmentControls
						curves={<ToneCurvesPanel histogram={histogram} />}
					/>
				</div>
				<EditorActions />
			</div>
		</PanelContent>
	);
}
