import { type EditorDocument, editLayer } from "@/core/document";

/** Points a LUT layer at another table; a layer still named after its old table takes the new name. */
export function setLut(document: EditorDocument, id: string, lut: string) {
  const { name } = document.resources.getLut(lut);
  editLayer(document, id, (layer) => {
    if (layer.kind !== "lut") {
      throw Error("Select a LUT layer.");
    }
    const named = layer.name === document.resources.getLut(layer.lut).name;
    return { ...layer, lut, name: named ? name : layer.name };
  });
}
