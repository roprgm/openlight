import { useEffect, useRef } from "react";
import { useRenderer } from "@/app/editor/renderer/provider";

export default function Histogram() {
	const renderer = useRenderer();
	const ref = useRef<SVGSVGElement>(null);
	useEffect(() => {
		if (ref.current) {
			return renderer.attachHistogram(ref.current);
		}
	}, [renderer]);
	return (
		<svg
			ref={ref}
			className="h-24 w-full"
			preserveAspectRatio="none"
			viewBox="0 0 255 100"
		/>
	);
}
