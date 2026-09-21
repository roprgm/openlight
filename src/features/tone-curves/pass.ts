import type { ToneCurve } from "@/core/document";
import { node } from "@/core/renderer";
import { sampleCurve } from "./curve";
import shader from "./curves.wgsl";

export function toneCurves(points: ToneCurve, name = "curves") {
  if (points.every((point) => point.x === point.y)) {
    return;
  }
  return node(name, shader, {
    storage: { curve: sampleCurve(points, 1024) },
  });
}
