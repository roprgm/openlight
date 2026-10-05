import { type EditorDocument, editLayer } from "@/core/document";
import type { NoiseReduction } from "@/core/image";
import { change, parse } from "@/lib/parse";
import {
  defaultNoiseReduction,
  noiseReductionSchema,
  reducible,
} from "./model";

const noiseReductionChange = change(noiseReductionSchema);

/** Sets the image layer's noise reduction, keeping the strengths `values` omits. */
export function setNoiseReduction(
  document: EditorDocument,
  values: Partial<NoiseReduction>,
) {
  const [image] = document.scene.getState().layers;
  if (!reducible(document.resources.get(image.source))) {
    throw Error("Only RAW photos with a 2 × 2 mosaic take noise reduction.");
  }
  const strengths = parse(
    noiseReductionChange,
    values,
    "Invalid noise reduction",
  );
  editLayer(document, image.id, (layer) => {
    if (layer.kind !== "image") {
      throw Error("Select the image layer.");
    }
    const noiseReduction = {
      ...(layer.noiseReduction ?? defaultNoiseReduction),
      ...strengths,
    };
    return { ...layer, noiseReduction };
  });
}
