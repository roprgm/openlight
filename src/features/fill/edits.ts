import { type EditorDocument, editLayer, type Fill } from "@/core/document";
import { change, parse } from "@/lib/parse";
import { fillSchema } from "./model";

const fillChange = change(fillSchema);

export function setFill(
  document: EditorDocument,
  fill: Partial<Fill>,
  id: string,
) {
  const values = parse(fillChange, fill, "Invalid fill setting");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "fill") {
      throw Error("Select a color layer.");
    }
    return { ...layer, fill: { ...layer.fill, ...values } };
  });
}
