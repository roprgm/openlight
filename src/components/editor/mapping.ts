import { useMemo } from "react";
import {
  type ImageFrame,
  outputToSource,
  type Point,
  sourceToOutput,
} from "@/core/image/frame";
import type { View } from "@/core/renderer";
import {
  apply,
  type Ellipse,
  ellipsePath,
  type Homography,
  jacobian,
  multiply,
  polygonPath,
  project,
  projectEllipse,
} from "@/lib/projective";
import { useDocument, useScene } from "./session";
import { useViewport } from "./viewport";

/** A source shape as the viewport shows it: an ellipse exactly, or path data for a visible part. */
export type Shape = { ellipse: Ellipse } | { path: string };

/**
 * Converts between viewport pixels, from the viewport's top-left corner, and source-pixel document
 * positions through the displayed frame, perspective included.
 */
export function createMapping(
  frame: ImageFrame,
  source: readonly number[],
  view: View,
  scale: number,
  viewport: Point,
) {
  const [x, y] = [viewport[0] / 2 + view.pan[0], viewport[1] / 2 + view.pan[1]];
  const toSource = multiply(outputToSource(frame, source), [
    1 / scale,
    0,
    -x / scale,
    0,
    1 / scale,
    -y / scale,
    0,
    0,
    1,
  ]);
  const toViewport = multiply(
    [scale, 0, x, 0, scale, y, 0, 0, 1],
    sourceToOutput(frame, source),
  );
  const weight = (matrix: Homography, point: Point) => apply(matrix, point)[2];
  const corners = (size: readonly number[]): Point[] => [
    [0, 0],
    [size[0], 0],
    [0, size[1]],
    [size[0], size[1]],
  ];
  // A viewport point reaches the source over a weight that varies linearly across the viewport, 1
  // everywhere without perspective, and falls to 0 at the perspective's horizon. Input stops at half
  // the least weight within the photo, the inverse of the most its corners take the other way: a
  // straight line short of the horizon, so document positions stay finite.
  const reach =
    0.5 /
    Math.max(...corners(source).map((point) => weight(toViewport, point)));
  // A source point shown in the viewport takes the inverse of its weight there, at least 1/deepest;
  // one below half that lands outside the viewport.
  const deepest = Math.max(
    ...corners(viewport).map((point) => weight(toSource, point)),
  );
  const visible = deepest > 0 ? 0.5 / deepest : Infinity;
  function place(point: Point): Point {
    const [sx, sy, w] = apply(toSource, point);
    return [sx / w, sy / w];
  }
  return {
    /** The document position under a viewport point; none past where input stops. */
    toDocument: (point: Point) =>
      weight(toSource, point) >= reach ? place(point) : undefined,
    /**
     * The document points a pointer adds moving between two viewport points: where it crosses the
     * line input stops at, then its end if input reaches it. A stroke that leaves and returns joins
     * along that line, off the photo.
     */
    trail(from: Point, to: Point): Point[] {
      const [a, b] = [weight(toSource, from), weight(toSource, to)];
      const end = b >= reach ? [place(to)] : [];
      if (a >= reach === b >= reach) {
        return end;
      }
      const t = (a - reach) / (a - b);
      const crossing = place([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ]);
      return [crossing, ...end];
    },
    /** The viewport position of a document position; none behind the horizon. */
    toScreen: (point: Point) => project(toViewport, point),
    /** Viewport pixels per source pixel around a document position, by area. */
    scale(point: Point) {
      const [[a, b], [c, d]] = jacobian(toViewport, point);
      return Math.sqrt(Math.abs(a * d - b * c));
    },
    /** The viewport direction of a source direction at a document position, along which lines stay lines. */
    direction(point: Point, [dx, dy]: Point): Point {
      const [[a, b], [c, d]] = jacobian(toViewport, point);
      return [a * dx + b * dy, c * dx + d * dy];
    },
    /** A source ellipse's image, exactly where it is bounded; otherwise the part the viewport can show. */
    ellipse(ellipse: Ellipse): Shape | undefined {
      const exact = projectEllipse(toSource, ellipse);
      if (exact) return { ellipse: exact };
      const path = ellipsePath(toViewport, ellipse, visible);
      return path ? { path } : undefined;
    },
    /** Path data for a source polygon's image, as far as the viewport can show it. */
    polygon: (points: readonly Point[]) =>
      polygonPath(toViewport, points, visible),
  };
}

export type DocumentMapping = ReturnType<typeof createMapping>;

/** The mapping of the viewport this renders in, following the scene's frame and the camera. */
export function useDocumentMapping() {
  const camera = useViewport();
  const document = useDocument();
  const frame = useScene((scene) => scene.frame);
  const size = document.resources.get(
    useScene((scene) => scene.layers[0].source),
  ).image.size;
  const { view, scale, viewport } = camera;
  return useMemo(
    () => createMapping(frame, size, view, scale, viewport),
    [frame, size, view, scale, viewport],
  );
}
