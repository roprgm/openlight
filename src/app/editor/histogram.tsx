import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { useRenderer } from "@/components/editor/pipeline";
import { Histogram } from "@/features/histogram";
import { createHistogram } from "@/features/histogram/histogram";
import { ClippingControls } from "./clipping-controls";

const colors = ["#f25445", "#6bd175", "#5c8ffa"] as const;

export function ImageHistogram() {
  const gpu = useGpu();
  const renderer = useRenderer();
  const histogram = useMemo(() => createHistogram(gpu), [gpu]);
  useEffect(() => () => histogram.dispose(), [histogram]);
  return (
    <section
      aria-label="Image histogram"
      className="group relative shrink-0 border-b border-black bg-neutral-900 max-md:absolute max-md:bottom-full max-md:left-3 max-md:z-10 max-md:mb-3 max-md:h-14 max-md:w-44 max-md:overflow-hidden max-md:border-0 max-md:bg-neutral-800/80 max-md:backdrop-blur-sm"
    >
      <ClippingControls />
      <Histogram
        histogram={histogram}
        image={renderer.outputImage}
        subscribe={renderer.subscribe}
        colors={colors}
        fillOpacity={0.2}
        className="block h-25 w-full max-md:h-full"
        aria-label="output histogram"
      />
    </section>
  );
}
