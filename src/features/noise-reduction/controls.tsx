import { Slider } from "@roprgm/ui/slider";
import { Spinner } from "@roprgm/ui/spinner";
import { useEffect, useState } from "react";
import { useGpu } from "vgpu-react";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { ImageLayer, Layer } from "@/core/document";
import type { Mosaic } from "@/core/image";
import { denoiseMosaic } from "./denoise";
import { setNoiseReduction } from "./edits";

/**
 * Whether the mosaic's noise-reduced samples are still being made for an amount above zero: the
 * first time is slow, and the renderer shows the photo as it was until they are ready.
 */
function useReducing(mosaic: Mosaic | undefined, amount: number) {
  const gpu = useGpu();
  const [settled, setSettled] = useState<Mosaic>();
  const wanted = amount > 0;
  useEffect(() => {
    if (!mosaic || !wanted) {
      return;
    }
    let active = true;
    const settle = () => active && setSettled(mosaic);
    mosaic
      .denoised((mosaic, signal) => denoiseMosaic(gpu, mosaic, signal))
      .then(settle, settle);
    return () => {
      active = false;
    };
  }, [gpu, mosaic, wanted]);
  return wanted && settled !== mosaic;
}

/**
 * The image layer's noise reduction for a RAW photo whose mosaic the GPU demosaics, and whether its
 * first reduction is running; nothing for other layers and photos.
 */
export function useNoiseReduction(
  layer: Layer,
): { parameter: Parameter; reducing: boolean } | undefined {
  const document = useDocument();
  const image = layer.kind === "image" ? layer : undefined;
  const mosaic = image && document.resources.get(image.source).raw?.mosaic;
  const value = image?.noiseReduction ?? 0;
  const reducing = useReducing(mosaic, value);
  if (!mosaic) {
    return undefined;
  }
  return {
    parameter: {
      id: "noiseReduction",
      label: "Noise reduction",
      value,
      min: 0,
      max: 100,
      defaultValue: 0,
      onChange: (amount) => setNoiseReduction(document, amount),
    },
    reducing,
  };
}

/** The noise reduction slider, with a spinner beside its label while the first reduction runs. */
export function NoiseReductionControls({ layer }: { layer: ImageLayer }) {
  const noiseReduction = useNoiseReduction(layer);
  if (!noiseReduction) {
    return null;
  }
  const { id, ...parameter } = noiseReduction.parameter;
  return (
    <div className="relative">
      <Slider {...parameter} />
      {noiseReduction.reducing && (
        // The slider's label row again, its text hidden, so the spinner follows the label.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 py-0.5">
          <span aria-hidden className="invisible">
            {parameter.label}
          </span>
          <Spinner aria-label="Reducing noise" className="size-3" />
        </div>
      )}
    </div>
  );
}
