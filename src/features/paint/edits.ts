import {
  type Blend,
  type EditorDocument,
  editLayer,
  type Layer,
  type PaintStroke,
  type StrokePoint,
} from "@/core/document";
import { paintStrokeSchema, strokePoints } from "@/core/document/brush";
import { parse } from "@/lib/parse";
import { paintShape } from "./model";

function paintLayer(layer: Layer) {
  if (layer.kind !== "paint") {
    throw Error("Select a paint layer.");
  }
  return layer;
}

/** Starts a stroke on a paint layer; group it with the points that follow. */
export function addPaintStroke(
  document: EditorDocument,
  id: string,
  stroke: PaintStroke,
) {
  const painted = parse(paintStrokeSchema, stroke, "Invalid stroke");
  editLayer(document, id, (item) => {
    const layer = paintLayer(item);
    return { ...layer, strokes: [...layer.strokes, painted] };
  });
}

/** Appends points to the layer's last stroke, keeping earlier points so rendering only stamps the new ones. */
export function extendPaintStroke(
  document: EditorDocument,
  id: string,
  points: readonly StrokePoint[],
) {
  const added = parse(strokePoints, points, "Invalid stroke points");
  editLayer(document, id, (item) => {
    const layer = paintLayer(item);
    const last = layer.strokes.at(-1);
    if (!last) {
      throw Error("Start a stroke before extending it.");
    }
    const stroke = { ...last, points: [...last.points, ...added] };
    return { ...layer, strokes: [...layer.strokes.slice(0, -1), stroke] };
  });
}

export function setPaintBlend(
  document: EditorDocument,
  id: string,
  blend: Blend,
) {
  const value = parse(paintShape.blend, blend, "Invalid blend");
  editLayer(document, id, (layer) => ({ ...paintLayer(layer), blend: value }));
}
