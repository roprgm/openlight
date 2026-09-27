import { cva } from "class-variance-authority";
import { useRenderer } from "@/components/editor/pipeline";
import { Histogram } from "@/features/histogram";
import { ClippingControls } from "./clipping-controls";

const colors = ["#f25445", "#6bd175", "#5c8ffa"] as const;

const placement = cva("group shrink-0", {
  variants: {
    placement: {
      panel: "relative bg-level-2",
      // Anchored like the zoom control, at the canvas's other bottom corner.
      canvas:
        "absolute bottom-3 left-3 z-10 h-14 w-44 overflow-hidden rounded-md bg-level-4/80 backdrop-blur-sm",
    },
  },
});

/** The output histogram: a section of the sidebar, or floating over the canvas in the mobile layout. */
export function ImageHistogram({
  placement: where,
}: {
  placement: "panel" | "canvas";
}) {
  const renderer = useRenderer();
  return (
    <section
      aria-label="Image histogram"
      className={placement({ placement: where })}
    >
      <ClippingControls />
      <Histogram
        image={renderer.outputImage}
        subscribe={renderer.subscribe}
        colors={colors}
        fillOpacity={0.2}
        className={where === "panel" ? "block h-25 w-full" : "block size-full"}
        aria-label="output histogram"
      />
    </section>
  );
}
