import { useId, useState } from "react";
import { MappedShape } from "@/components/editor/mapped-shape";
import {
  type DocumentMapping,
  type Shape,
  useDocumentMapping,
} from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import type { BrushStroke, HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { type AnchorDrag, HealAnchor } from "./anchor";
import { setHealDestination, setHealSource } from "./edits";
import { findHealPatch } from "./model";

/**
 * A hard stroke as the viewport shows it: the dabs it lays at its points and the rectangles they sweep
 * between them, exactly as perspective maps their union.
 */
type Geometry = {
  mode: BrushStroke["mode"];
  /** Where the stroke starts, unless it is behind the horizon. */
  first?: Point;
  sweeps: string;
  dabs: Shape[];
};

function geometry(
  stroke: BrushStroke,
  offset: Point,
  mapping: DocumentMapping,
): Geometry {
  const points = stroke.points.map(
    ([x, y]): Point => [x + offset[0], y + offset[1]],
  );
  const radius = stroke.size / 2;
  // Each rectangle runs the same way round, so one path's fill unites them.
  const sweeps = points.slice(1).map((end, i) => {
    const start = points[i];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (!length) return "";
    const nx = ((start[1] - end[1]) / length) * radius;
    const ny = ((end[0] - start[0]) / length) * radius;
    return mapping.polygon([
      [start[0] - nx, start[1] - ny],
      [end[0] - nx, end[1] - ny],
      [end[0] + nx, end[1] + ny],
      [start[0] + nx, start[1] + ny],
    ]);
  });
  return {
    mode: stroke.mode,
    first: mapping.toScreen(points[0]),
    sweeps: sweeps.join(""),
    dabs: points.flatMap(
      (center) =>
        mapping.ellipse({ center, radii: [radius, radius], angle: 0 }) ?? [],
    ),
  };
}

function StrokeShape({ shape, color }: { shape: Geometry; color: string }) {
  return (
    <>
      <path d={shape.sweeps} fill={color} />
      {shape.dabs.map((dab, index) => (
        <MappedShape key={index} shape={dab} fill={color} />
      ))}
    </>
  );
}

function CoverageMask({
  id,
  shapes,
  region,
}: {
  id: string;
  shapes: readonly Geometry[];
  region?: { x: number; y: number; width: number; height: number };
}) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" {...region}>
      <rect width="100%" height="100%" fill="black" />
      {shapes.map((shape, index) => (
        <StrokeShape
          key={index}
          shape={shape}
          color={shape.mode === "paint" ? "white" : "black"}
        />
      ))}
    </mask>
  );
}

/**
 * Viewport bounds of the dabs, which hold the rectangles between them too; a path, the part of a dab
 * that reaches the horizon, may run anywhere.
 */
function bounds(shapes: readonly Geometry[], viewport: Point) {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const dab of shapes.flatMap((shape) => shape.dabs)) {
    if ("path" in dab) {
      return { left: 0, top: 0, right: viewport[0], bottom: viewport[1] };
    }
    const [x, y] = dab.ellipse.center;
    const reach = Math.max(...dab.ellipse.radii);
    left = Math.min(left, x - reach);
    top = Math.min(top, y - reach);
    right = Math.max(right, x + reach);
    bottom = Math.max(bottom, y + reach);
  }
  return { left, top, right, bottom };
}

function Outline({
  shapes,
  kind,
}: {
  shapes: readonly Geometry[];
  kind: "destination" | "source";
}) {
  const mask = useId();
  const edge = `${mask}-edge`;
  const { viewport } = useViewport();
  const box = bounds(shapes, viewport);
  // Keep the artificial raster edge outside the viewport, including the filter's support.
  const left = Math.max(-4, box.left - 4);
  const top = Math.max(-4, box.top - 4);
  const right = Math.min(viewport[0] + 4, box.right + 4);
  const bottom = Math.min(viewport[1] + 4, box.bottom + 4);
  if (right <= left || bottom <= top) return null;
  const region = { x: left, y: top, width: right - left, height: bottom - top };
  return (
    <g data-heal-outline={kind} opacity={kind === "source" ? 0.55 : 1}>
      <defs>
        <CoverageMask id={mask} shapes={shapes} region={region} />
        <filter id={edge} filterUnits="userSpaceOnUse" {...region}>
          <feMorphology
            in="SourceAlpha"
            operator="dilate"
            radius="1"
            result="outer"
          />
          <feMorphology
            in="SourceAlpha"
            operator="erode"
            radius="1"
            result="inner"
          />
          <feComposite in="outer" in2="inner" operator="out" result="border" />
          <feFlood floodColor="white" />
          <feComposite in2="border" operator="in" />
          <feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="black" />
        </filter>
      </defs>
      <g filter={`url(#${edge})`}>
        <rect {...region} fill="white" mask={`url(#${mask})`} />
      </g>
    </g>
  );
}

/** Shows the edited selection without changing the rendered image. */
export function HealStrokePreview({
  strokes,
}: {
  strokes: readonly BrushStroke[];
}) {
  const mapping = useDocumentMapping();
  const mask = useId();
  const shapes = strokes.map((stroke) => geometry(stroke, [0, 0], mapping));
  return (
    <g data-heal-stroke-preview="true">
      <defs>
        <CoverageMask id={mask} shapes={shapes} />
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="white"
        opacity={0.15}
        mask={`url(#${mask})`}
      />
      <Outline shapes={shapes} kind="destination" />
    </g>
  );
}

/** Draws a solid destination and a quieter source contour with first-point anchors. */
export function HealPatchOutline({
  layer,
  patch,
  showSource,
  interactive,
}: {
  layer: string;
  patch: HealPatch;
  showSource: boolean;
  interactive: boolean;
}) {
  const document = useDocument();
  const mapping = useDocumentMapping();
  const [preview, setPreview] = useState<Point>();
  const first = patch.strokes[0].points[0];
  const offset: Point = preview
    ? [preview[0] - first[0], preview[1] - first[1]]
    : [0, 0];
  const destination = patch.strokes.map((stroke) =>
    geometry(stroke, offset, mapping),
  );
  const source =
    showSource &&
    patch.mode !== "remove" &&
    patch.strokes.map((stroke) => geometry(stroke, patch.offset, mapping));
  // Remove previews the contour and solves on drop; donor repairs follow the drag live.
  const moveDestination = (next?: Point) => {
    if (next && findHealPatch(document.scene.getState(), layer, patch.id))
      setHealDestination(document, layer, patch.id, next);
  };
  const moveSource = (next?: Point) => {
    if (next) setHealSource(document, layer, patch.id, next);
  };
  const destinationDrag: AnchorDrag | undefined = interactive
    ? {
        from: [first[0], first[1]],
        editOnRelease: patch.mode === "remove",
        onDrag: patch.mode === "remove" ? setPreview : moveDestination,
        onDrop: moveDestination,
      }
    : undefined;
  const sourceDrag: AnchorDrag | undefined =
    interactive && patch.mode !== "remove"
      ? {
          from: patch.offset,
          onDrag: moveSource,
          onDrop: moveSource,
        }
      : undefined;
  const destinationAnchor = destination[0].first;
  const sourceAnchor = source ? source[0].first : undefined;
  return (
    <>
      <Outline shapes={destination} kind="destination" />
      {destinationAnchor && (
        <HealAnchor
          kind="destination"
          center={destinationAnchor}
          drag={destinationDrag}
        />
      )}
      {source && (
        <>
          <Outline shapes={source} kind="source" />
          {sourceAnchor && (
            <HealAnchor kind="source" center={sourceAnchor} drag={sourceDrag} />
          )}
        </>
      )}
    </>
  );
}
