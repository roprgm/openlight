import {
  type Adjustments,
  type EditorDocument,
  editLayer,
} from "@/core/document";
import { adjustmentLimits } from "./model";

export function setAdjustments(
  document: EditorDocument,
  change: Partial<Adjustments>,
  id = document.scene.getState().layers[0].id,
) {
  for (const [name, value] of Object.entries(change)) {
    const limit = Reflect.get(adjustmentLimits, name);
    if (
      typeof limit !== "number" ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value > limit ||
      value < -limit
    ) {
      throw new Error(`Invalid adjustment: ${name}.`);
    }
  }
  editLayer(document, id, (layer) => {
    if (layer.kind !== "image" && layer.kind !== "mask") {
      throw Error("Select an image or mask layer.");
    }
    const adjustments = { ...layer.adjustments, ...change };

    return { ...layer, adjustments };
  });
}
