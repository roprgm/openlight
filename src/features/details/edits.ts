import { type Details, type EditorDocument, editLayer } from "@/core/document";
import { change, parse } from "@/lib/parse";
import { detailsSchema } from "./model";

export const detailsChange = change(detailsSchema);

export function setDetails(
  document: EditorDocument,
  details: Partial<Details>,
  id: string,
) {
  const values = parse(detailsChange, details, "Invalid detail adjustment");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "details") {
      throw Error("Select a Details layer.");
    }
    return { ...layer, details: { ...layer.details, ...values } };
  });
}
