import { type EditorDocument, editLayer, type Fill } from "@/core/document";
import { parse } from "@/lib/parse";
import { fillSchema } from "./model";

const fillChange = fillSchema.partial().strict();

export function setFill(
  document: EditorDocument,
  change: Partial<Fill>,
  id: string,
) {
  const values = parse(fillChange, change, "Invalid fill setting");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "fill") {
      throw Error("Select a color layer.");
    }
    return { ...layer, fill: { ...layer.fill, ...values } };
  });
}
