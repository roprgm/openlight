import { type EditorDocument, editLayer, type Fill } from "@/core/document";
import { validateFill } from "./model";

export function setFill(
  document: EditorDocument,
  change: Partial<Fill>,
  id: string,
) {
  validateFill(change);
  editLayer(document, id, (layer) => {
    if (layer.kind !== "fill") {
      throw Error("Select a color layer.");
    }
    return {
      ...layer,
      fill: {
        ...layer.fill,
        ...change,
        ...(change.color ? { color: change.color.toLowerCase() } : {}),
      },
    };
  });
}
