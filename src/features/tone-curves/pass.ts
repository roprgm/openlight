import type { ToneCurve } from "@/core/document";
import { node } from "@/core/renderer";
import { sampleCurve } from "./curve";
import shader from "./curves.wgsl";

/** The table the curve shaders read, or none for an identity curve, which changes nothing. */
export function curveTable(points: ToneCurve) {
  if (points.every((point) => point.x === point.y)) {
    return;
  }
  return sampleCurve(points, 1024);
}

export function toneCurves(points: ToneCurve, name = "curves") {
  const curve = curveTable(points);
  if (!curve) {
    return;
  }
  return node(name, shader, { storage: { curve } });
}
