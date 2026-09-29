import { type EditorDocument, editLayer, type Grain } from "@/core/document";
import { change, parse } from "@/lib/parse";
import { grainSchema } from "./model";

const grainChange = change(grainSchema);

export function setGrain(
  document: EditorDocument,
  grain: Partial<Grain>,
  id: string,
) {
  const values = parse(grainChange, grain, "Invalid grain adjustment");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "grain") {
      throw Error("Select a grain layer.");
    }
    return { ...layer, grain: { ...layer.grain, ...values } };
  });
}
