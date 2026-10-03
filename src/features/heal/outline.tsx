import { memo, useId, useState } from "react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import type { BrushStroke, HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { type AnchorDrag, HealAnchor } from "./anchor";
import { setHealDestination, setHealSource } from "./edits";
import { findHealPatch } from "./model";

type Geometry = {
  mode: BrushStroke["mode"];
  center: Point;
  d: string;
  first: Point;
  last: Point;
  width: number;
  bounds: { left: number; top: number; right: number; bottom: number };
};
type Mapping = ReturnType<typeof useDocumentMapping>;

function geometry(
  stroke: BrushStroke,
  offset: Point,
  mapping: Mapping,
): Geometry {
  const points = stroke.points.map(([x, y]) =>
    mapping.toScreen([x + offset[0], y + offset[1]]),
  );
  const width = stroke.size / mapping.pixelsPerViewportPixel;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x, y] of points) {
    left = Math.min(left, x - width / 2);
    top = Math.min(top, y - width / 2);
    right = Math.max(right, x + width / 2);
    bottom = Math.max(bottom, y + width / 2);
  }
  return {
    mode: stroke.mode,
    center: points[0],
    d: points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(""),
    first: points[0],
    last: points.at(-1) ?? points[0],
    width,
    bounds: { left, top, right, bottom },
  };
}

function StrokeShape({
  shape,
  width,
  color,
}: {
  shape: Geometry;
  width: number;
  color: string;
}) {
  return (
    <>
      <path
        d={shape.d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={shape.first[0]}
        cy={shape.first[1]}
        r={width / 2}
        fill={color}
      />
      <circle
        cx={shape.last[0]}
        cy={shape.last[1]}
        r={width / 2}
        fill={color}
      />
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
          width={shape.width}
          color={shape.mode === "paint" ? "white" : "black"}
        />
      ))}
    </mask>
  );
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
  // Keep the artificial raster edge outside the viewport, including the filter's support.
  const left = Math.max(
    -4,
    Math.min(...shapes.map((shape) => shape.bounds.left)) - 4,
  );
  const top = Math.max(
    -4,
    Math.min(...shapes.map((shape) => shape.bounds.top)) - 4,
  );
  const right = Math.min(
    viewport[0] + 4,
    Math.max(...shapes.map((shape) => shape.bounds.right)) + 4,
  );
  const bottom = Math.min(
    viewport[1] + 4,
    Math.max(...shapes.map((shape) => shape.bounds.bottom)) + 4,
  );
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
  return (
    <>
      <Outline shapes={destination} kind="destination" />
      <HealAnchor
        kind="destination"
        center={destination[0].center}
        drag={destinationDrag}
      />
      {source && (
        <>
          <Outline shapes={source} kind="source" />
          <HealAnchor
            kind="source"
            center={source[0].center}
            drag={sourceDrag}
          />
        </>
      )}
    </>
  );
}

/** A patch's first-point anchor, which selects it, so painting over its body starts a new patch. */
export const HealPatchSelector = memo(function HealPatchSelector({
  patch,
  onSelect,
}: {
  patch: HealPatch;
  onSelect: (id: string) => void;
}) {
  const mapping = useDocumentMapping();
  const { center } = geometry(patch.strokes[0], [0, 0], mapping);
  return (
    <HealAnchor
      kind="destination"
      center={center}
      onSelect={() => onSelect(patch.id)}
    />
  );
});
