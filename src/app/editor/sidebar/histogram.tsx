import { useEffect, useRef } from "react";
import { useRenderer } from "@/app/editor/renderer/provider";
import type { HistogramOptions } from "@/app/editor/renderer/renderer";

type HistogramProps = HistogramOptions & { className?: string };

export default function Histogram({
	stage = "output",
	mode = "rgb",
	className = "h-24 w-full",
}: HistogramProps) {
	const renderer = useRenderer();
	const ref = useRef<SVGSVGElement>(null);
	useEffect(() => {
		if (ref.current) {
			return renderer.attachHistogram(ref.current, { stage, mode });
		}
	}, [renderer, stage, mode]);
	return (
		<svg
			ref={ref}
			aria-label={`${stage} histogram`}
			className={className}
			preserveAspectRatio="none"
			viewBox="0 0 255 100"
		/>
	);
}
