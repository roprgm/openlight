import {
  type EditorDocument,
  editLayer,
  type MaskRange,
} from "@/core/document";
import { parse } from "@/lib/parse";
import { rangeSchema } from "./model";

/** Narrows a mask to a range of the image below it; without one, the mask covers its shape again. */
export function setMaskRange(
  document: EditorDocument,
  id: string,
  range?: MaskRange,
) {
  const next = range && parse(rangeSchema, range, "Invalid mask range");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "mask") {
      throw Error("Select a mask layer.");
    }
    const { range: _, ...shape } = layer;
    return next ? { ...shape, range: next } : shape;
  });
}
