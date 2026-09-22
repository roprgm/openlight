import { type EditorDocument, editLayer, type Vignette } from "@/core/document";
import { change, parse } from "@/lib/parse";
import { vignetteSchema } from "./model";

const vignetteChange = change(vignetteSchema);

export function setVignette(
  document: EditorDocument,
  vignette: Partial<Vignette>,
  id: string,
) {
  const values = parse(vignetteChange, vignette, "Invalid vignette adjustment");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "vignette") {
      throw Error("Select a vignette layer.");
    }
    return { ...layer, vignette: { ...layer.vignette, ...values } };
  });
}
