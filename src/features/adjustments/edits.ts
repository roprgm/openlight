import {
  type Adjustments,
  type EditorDocument,
  editLayer,
} from "@/core/document";
import { validateAdjustments } from "./model";

export function setAdjustments(
  document: EditorDocument,
  change: Partial<Adjustments>,
  id = document.scene.getState().layers[0].id,
) {
  validateAdjustments(change);
  editLayer(document, id, (layer) => {
    if (layer.kind !== "image" && layer.kind !== "mask") {
      throw Error("Select an image or mask layer.");
    }
    const adjustments = { ...layer.adjustments, ...change };

    return { ...layer, adjustments };
  });
}
