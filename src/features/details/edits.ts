import { type Details, type EditorDocument, editLayer } from "@/core/document";
import { parse } from "@/lib/parse";
import { detailsSchema } from "./model";

export const detailsChange = detailsSchema.partial().strict();

export function setDetails(
  document: EditorDocument,
  change: Partial<Details>,
  id: string,
) {
  const values = parse(detailsChange, change, "Invalid detail adjustment");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "details") {
      throw Error("Select a Details layer.");
    }
    return { ...layer, details: { ...layer.details, ...values } };
  });
}
