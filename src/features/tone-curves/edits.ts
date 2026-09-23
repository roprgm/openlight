import {
  type EditorDocument,
  editLayer,
  type ToneCurve,
} from "@/core/document";
import { parse } from "@/lib/parse";
import { curveSchema, defaultCurve } from "./curve";

export function setToneCurve(
  document: EditorDocument,
  points: ToneCurve = defaultCurve,
  id = document.scene.getState().layers[0].id,
) {
  const toneCurve = parse(curveSchema, points, "Invalid tone curve");
  editLayer(document, id, (layer) => {
    if (layer.kind !== "image" && layer.kind !== "mask") {
      throw Error("Select an image or mask layer.");
    }
    return { ...layer, toneCurve };
  });
}
