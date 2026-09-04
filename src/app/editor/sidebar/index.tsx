import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { useRenderer } from "@/app/editor/renderer/provider";
import ResizablePanel from "@/components/ui/resizable-panel";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import AdjustmentControls from "./adjustment-controls";
import { Curves } from "./curves";
import ExportButton from "./export-button";

const histogramColors = ["#f25445", "#6bd175", "#5c8ffa"] as const;

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
					<Curves histogram={histogram} />
				</div>
				<ExportButton />
			</div>
		</ResizablePanel>
	);
}
