import { memo, type PointerEvent, useId, useState } from "react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import type { BrushStroke, HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { type AnchorDrag, HealAnchor } from "./anchor";
import { setHealDestination, setHealSource } from "./edits";
import { patchContains } from "./model";

type Geometry = {
  mode: BrushStroke["mode"];
  center: Point;
  d: string;
  first: Point;
  last: Point;
  width: number;
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
  return {
    mode: stroke.mode,
    center: points[0],
    d: points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(""),
    first: points[0],
    last: points.at(-1) ?? points[0],
    width,
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
  spread = 0,
}: {
  id: string;
  shapes: readonly Geometry[];
  spread?: number;
}) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse">
      <rect width="100%" height="100%" fill="black" />
      {shapes.map((shape, index) => {
        const paint = shape.mode === "paint";
        const width = Math.max(0, shape.width + (paint ? spread : -spread) * 2);
        return (
          width > 0 && (
            <StrokeShape
              key={index}
              shape={shape}
              width={width}
              color={paint ? "white" : "black"}
            />
          )
        );
      })}
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
  const outer = `${mask}-outer`;
  const inner = `${mask}-inner`;
  return (
    <g data-heal-outline={kind} opacity={kind === "source" ? 0.55 : 1}>
      <defs>
        <CoverageMask id={outer} shapes={shapes} spread={1} />
        <CoverageMask id={inner} shapes={shapes} spread={-1} />
        <mask id={mask} maskUnits="userSpaceOnUse">
          <rect
            width="100%"
            height="100%"
            fill="white"
            mask={`url(#${outer})`}
          />
          <rect
            width="100%"
            height="100%"
            fill="black"
            mask={`url(#${inner})`}
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="white"
        mask={`url(#${mask})`}
        className="drop-shadow-[0_0_1px_black]"
      />
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
    if (next) setHealDestination(document, layer, patch.id, next);
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

/** Keeps canvas selection on the painted geometry without adding a visible marker over the result. */
export const HealPatchHitTarget = memo(function HealPatchHitTarget({
  patch,
  onSelect,
}: {
  patch: HealPatch;
  onSelect: (id: string) => void;
}) {
  const mapping = useDocumentMapping();
  const select = (event: PointerEvent<SVGElement>) => {
    if (event.shiftKey || event.altKey) return;
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (
      !box ||
      !patchContains(
        patch.strokes,
        mapping.toDocument(event.clientX, event.clientY, box),
        8 * mapping.pixelsPerViewportPixel,
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(patch.id);
  };
  return (
    <g
      data-heal-hit-target={patch.id}
      onPointerDown={select}
      pointerEvents="all"
    >
      {patch.strokes
        .filter((stroke) => stroke.mode === "paint")
        .map((stroke, index) => {
          const shape = geometry(stroke, [0, 0], mapping);
          return (
            <StrokeShape
              key={index}
              shape={shape}
              width={Math.max(16, shape.width)}
              color="transparent"
            />
          );
        })}
    </g>
  );
});
