import { type EditorDocument, editLayer, type Vignette } from "@/core/document";

export function validateVignette(change: Partial<Vignette>) {
  for (const [name, value] of Object.entries(change)) {
    if (
      (name !== "intensity" && name !== "softness") ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new Error(`Invalid vignette adjustment: ${name}.`);
    }
  }
}

export function setVignette(
  document: EditorDocument,
  change: Partial<Vignette>,
  id: string,
) {
  validateVignette(change);
  editLayer(document, id, (layer) => {
    if (layer.kind !== "vignette") {
      throw Error("Select a vignette layer.");
    }
    return { ...layer, vignette: { ...layer.vignette, ...change } };
  });
}
