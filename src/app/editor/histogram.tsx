import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { useRenderer } from "@/components/editor/pipeline";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import { ClippingControls } from "./clipping-controls";

const colors = ["#f25445", "#6bd175", "#5c8ffa"] as const;

export function FloatingHistogram() {
	const gpu = useGpu();
	const renderer = useRenderer();
	const histogram = useMemo(() => createHistogram(gpu), [gpu]);
	useEffect(() => () => histogram.dispose(), [histogram]);
	return (
		<section
			aria-label="Image histogram"
			className="pointer-events-none absolute top-3 right-3 z-10 w-44 rounded-md border border-white/10 bg-black/30 p-1 backdrop-blur-sm md:w-52"
		>
			<ClippingControls />
			<Histogram
				histogram={histogram}
				image={renderer.outputImage}
				subscribe={renderer.subscribe}
				colors={colors}
				fillOpacity={0.2}
				className="h-20 w-full"
				aria-label="output histogram"
			/>
		</section>
	);
}
