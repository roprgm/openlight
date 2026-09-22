import {
  type Adjustments,
  type EditorDocument,
  editLayer,
} from "@/core/document";
import { parse } from "@/lib/parse";
import { adjustmentsSchema, exposureSchema } from "./model";

const adjustmentChange = adjustmentsSchema.partial().strict();

export function setAdjustments(
  document: EditorDocument,
  change: Partial<Adjustments>,
  id = document.scene.getState().layers[0].id,
) {
  const values = parse(adjustmentChange, change, "Invalid adjustment");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "image" && layer.kind !== "mask") {
      throw Error("Select an image or mask layer.");
    }
    return { ...layer, adjustments: { ...layer.adjustments, ...values } };
  });
}

export function setExposure(
  document: EditorDocument,
  id: string,
  exposure: number,
) {
  const value = parse(exposureSchema, exposure, "Invalid Exposure");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "exposure") {
      throw Error("Select an exposure layer.");
    }
    return { ...layer, exposure: value };
  });
}
