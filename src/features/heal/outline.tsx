import { memo, type PointerEvent, useId } from "react";
import type { useDocumentMapping } from "@/components/editor/mapping";
import type { BrushStroke, HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { HealSourceHandle } from "./source-handle";

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
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const center: Point = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
  const width = stroke.size / mapping.pixelsPerViewportPixel;
  return {
    center,
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

/** Draws a solid destination and a quieter Smart clone source with their centers. */
export function HealPatchOutline({
  layer,
  patch,
  showSource,
  mapping,
}: {
  layer: string;
  patch: HealPatch;
  showSource: boolean;
  mapping: Mapping;
}) {
  const destination = geometry(patch.stroke, [0, 0], mapping);
  const source =
    patch.algorithm === "healing"
      ? geometry(patch.stroke, patch.offset, mapping)
      : undefined;
  return (
    <>
      <Outline shape={destination} kind="destination" />
      <circle
        data-heal-destination-handle="true"
        cx={destination.center[0]}
        cy={destination.center[1]}
        r="7"
        fill="#3b82f6"
        stroke="white"
        strokeWidth="2"
      />
      {showSource && source && <Outline shape={source} kind="source" />}
      {showSource && source && patch.algorithm === "healing" && (
        <HealSourceHandle layer={layer} patch={patch} center={source.center} />
      )}
    </>
  );
}

/** Keeps canvas selection on the painted geometry without adding a visible marker over the result. */
export const HealPatchHitTarget = memo(function HealPatchHitTarget({
  patch,
  mapping,
  onSelect,
}: {
  patch: HealPatch;
  mapping: Mapping;
  onSelect: (id: string) => void;
}) {
  const shape = geometry(patch.stroke, [0, 0], mapping);
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
