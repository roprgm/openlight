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
      className="group relative shrink-0 border-b border-black bg-neutral-900"
    >
      <ClippingControls />
      <Histogram
        histogram={histogram}
        image={renderer.outputImage}
        subscribe={renderer.subscribe}
        colors={colors}
        fillOpacity={0.2}
        className="h-25 w-full"
        aria-label="output histogram"
      />
    </section>
  );
}
