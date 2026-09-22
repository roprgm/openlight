import { type EditorDocument, editLayer, type Vignette } from "@/core/document";
import { parse } from "@/lib/parse";
import { vignetteSchema } from "./model";

const vignetteChange = vignetteSchema.partial().strict();

export function setVignette(
  document: EditorDocument,
  change: Partial<Vignette>,
  id: string,
) {
  const values = parse(vignetteChange, change, "Invalid vignette adjustment");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "vignette") {
      throw Error("Select a vignette layer.");
    }
    return { ...layer, vignette: { ...layer.vignette, ...values } };
  });
}
