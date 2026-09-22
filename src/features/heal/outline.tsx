import { memo, type PointerEvent, useId, useState } from "react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import type { BrushStroke, HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { type AnchorDrag, HealAnchor } from "./anchor";
import { setHealDestination, setHealSource } from "./edits";

type Geometry = {
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

function Outline({
  shape,
  kind,
}: {
  shape: Geometry;
  kind: "destination" | "source";
}) {
  const mask = useId();
  const outer = shape.width + 2;
  const inner = Math.max(0, shape.width - 2);
  return (
    <g data-heal-outline={kind} opacity={kind === "source" ? 0.55 : 1}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="black" />
          <StrokeShape shape={shape} width={outer} color="white" />
          {inner > 0 && (
            <StrokeShape shape={shape} width={inner} color="black" />
          )}
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
  // The donor only previews its contour while dragged, so the correction renders once on release.
  const [sourcePreview, setSourcePreview] = useState<Point>();
  const first = patch.stroke.points[0];
  const destination = geometry(patch.stroke, [0, 0], mapping);
  const source =
    showSource &&
    geometry(patch.stroke, sourcePreview ?? patch.offset, mapping);
  const moveDestination = (next?: Point) => {
    if (next) setHealDestination(document, layer, patch.id, next);
  };
  const destinationDrag: AnchorDrag | undefined = interactive
    ? {
        from: [first[0], first[1]],
        onDrag: moveDestination,
        onDrop: moveDestination,
      }
    : undefined;
  const sourceDrag: AnchorDrag | undefined = interactive
    ? {
        from: patch.offset,
        onDrag: setSourcePreview,
        onDrop: (next) => setHealSource(document, layer, patch.id, next),
      }
    : undefined;
  return (
    <>
      <Outline shape={destination} kind="destination" />
      <HealAnchor
        kind="destination"
        center={destination.center}
        drag={destinationDrag}
      />
      {source && (
        <>
          <Outline shape={source} kind="source" />
          <HealAnchor kind="source" center={source.center} drag={sourceDrag} />
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
  const shape = geometry(patch.stroke, [0, 0], useDocumentMapping());
  const select = (event: PointerEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(patch.id);
  };
  const width = Math.max(16, shape.width);
  return (
    <g
      data-heal-hit-target={patch.id}
      onPointerDown={select}
      pointerEvents="all"
    >
      <StrokeShape shape={shape} width={width} color="transparent" />
    </g>
  );
});
