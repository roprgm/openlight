import { Slider } from "@roprgm/ui/slider";
import { Spinner } from "@roprgm/ui/spinner";
import { useEffect, useState } from "react";
import { useGpu } from "vgpu-react";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { Layer } from "@/core/document";
import type { ImageSource } from "@/core/image";
import { setNoiseReduction } from "./edits";
import { defaultNoiseReduction, reducible } from "./model";
import { reduceNoise } from "./reduce";

/**
 * Whether the source's first reduction is running while some is asked for: it takes a moment, and
 * the renderer shows the photo as it was until it is ready.
 */
function useReducing(source: ImageSource | undefined, wanted: boolean) {
  const gpu = useGpu();
  const [settled, setSettled] = useState<ImageSource>();
  useEffect(() => {
    if (!source || !wanted) {
      return;
    }
    let active = true;
    const settle = () => active && setSettled(source);
    source
      .reduced((signal) => reduceNoise(gpu, source, signal))
      .then(settle, settle);
    return () => {
      active = false;
    };
  }, [gpu, source, wanted]);
  return wanted && settled !== source;
}

const controls = [
  ["luminance", "Luminance noise"],
  ["color", "Color noise"],
] as const;

/**
 * The image layer's noise reduction, light and color, and whether its first reduction is running;
 * nothing for other layers, or a RAW photo without a 2 × 2 mosaic.
 */
export function useNoiseReduction(
  layer: Layer,
): { parameters: Parameter[]; reducing: boolean } | undefined {
  const document = useDocument();
  const image = layer.kind === "image" ? layer : undefined;
  const source = image && document.resources.get(image.source);
  const strengths = image?.noiseReduction ?? defaultNoiseReduction;
  const reducing = useReducing(
    source,
    strengths.luminance > 0 || strengths.color > 0,
  );
  if (!source || !reducible(source)) {
    return undefined;
  }
  return {
    parameters: controls.map(([name, label]) => ({
      id: name,
      label,
      value: strengths[name],
      min: 0,
      max: 100,
      defaultValue: 0,
      onChange: (value) => setNoiseReduction(document, { [name]: value }),
    })),
    reducing,
  };
}

/** The noise reduction sliders, with a spinner beside the first's label while the first reduction runs. */
export function NoiseReductionControls({ layer }: { layer: Layer }) {
  const noiseReduction = useNoiseReduction(layer);
  if (!noiseReduction) {
    return null;
  }
  return noiseReduction.parameters.map(({ id, ...parameter }, i) => (
    <div key={id} className="relative">
      <Slider {...parameter} />
      {i === 0 && noiseReduction.reducing && (
        // The slider's label row again, its text hidden, so the spinner follows the label.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 py-0.5">
          <span aria-hidden className="invisible">
            {parameter.label}
          </span>
          <Spinner aria-label="Reducing noise" className="size-3" />
        </div>
      )}
    </div>
  ));
}
