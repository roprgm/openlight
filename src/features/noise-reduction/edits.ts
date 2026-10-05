import { type EditorDocument, editLayer } from "@/core/document";
import { parse } from "@/lib/parse";
import { noiseReductionSchema } from "./model";

/** Sets the image layer's noise reduction, 0 to 100, for a RAW photo the GPU demosaics. */
export function setNoiseReduction(document: EditorDocument, amount: number) {
  const [image] = document.scene.getState().layers;
  if (!document.resources.get(image.source).raw?.mosaic) {
    throw Error("Only RAW photos with a Bayer mosaic support noise reduction.");
  }
  const noiseReduction = parse(
    noiseReductionSchema,
    amount,
    "Invalid noise reduction",
  );
  editLayer(document, image.id, (layer) => {
    if (layer.kind !== "image") {
      throw Error("Select the image layer.");
    }
    return { ...layer, noiseReduction };
  });
}
