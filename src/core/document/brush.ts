import type { BrushStroke, StrokePoint } from "./scene";

export function validPoints(points: readonly StrokePoint[]) {
  return (
    Array.isArray(points) &&
    points.length > 0 &&
    points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 3 &&
        point.every(Number.isFinite) &&
        point[2] >= 0 &&
        point[2] <= 1,
    )
  );
}

export function validateStroke(stroke: BrushStroke) {
  if (
    (stroke.mode !== "paint" && stroke.mode !== "erase") ||
    !Number.isFinite(stroke.size) ||
    stroke.size <= 0 ||
    !Number.isFinite(stroke.feather) ||
    stroke.feather < 0 ||
    stroke.feather > 1 ||
    !Number.isFinite(stroke.flow) ||
    stroke.flow < 0 ||
    stroke.flow > 1 ||
    !validPoints(stroke.points)
  ) {
    throw Error(
      "A stroke needs a paint or erase mode, a positive size, feather and flow from 0 to 1, and finite points with pressure from 0 to 1.",
    );
  }
}
