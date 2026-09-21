import { memo, type PointerEvent, useId, useState } from "react";
import type { useDocumentMapping } from "@/components/editor/mapping";
import type { BrushStroke, HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { HealDestinationHandle } from "./destination-handle";
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

/** Draws a solid destination and a quieter Smart clone source with first-point anchors. */
export function HealPatchOutline({
  layer,
  patch,
  showSource,
  mapping,
  onMoveDestination,
  interactive,
}: {
  layer: string;
  patch: HealPatch;
  showSource: boolean;
  mapping: Mapping;
  onMoveDestination?: (id: string, signal: AbortSignal) => Promise<void>;
  interactive: boolean;
}) {
  const [preview, setPreview] = useState<Point>();
  const first = patch.stroke.points[0];
  const previewOffset: Point = preview
    ? [preview[0] - first[0], preview[1] - first[1]]
    : [0, 0];
  const destination = geometry(patch.stroke, previewOffset, mapping);
  const source =
    patch.algorithm === "healing"
      ? geometry(patch.stroke, patch.offset, mapping)
      : undefined;
  return (
    <>
      <Outline shape={destination} kind="destination" />
      {interactive ? (
        <HealDestinationHandle
          layer={layer}
          patch={patch}
          anchor={destination.center}
          onPreview={setPreview}
          onRelease={
            patch.algorithm === "ai"
              ? (signal) =>
                  onMoveDestination?.(patch.id, signal) ?? Promise.resolve()
              : undefined
          }
        />
      ) : (
        <circle
          data-heal-destination-anchor="true"
          cx={destination.center[0]}
          cy={destination.center[1]}
          r="7"
          fill="#3b82f6"
          stroke="white"
          strokeWidth="2"
        />
      )}
      {showSource && source && <Outline shape={source} kind="source" />}
      {showSource && source && patch.algorithm === "healing" && interactive && (
        <HealSourceHandle layer={layer} patch={patch} center={source.center} />
      )}
      {showSource && source && !interactive && (
        <circle
          data-heal-source-anchor="true"
          cx={source.center[0]}
          cy={source.center[1]}
          r="7"
          fill="#3b82f6"
          stroke="white"
          strokeWidth="2"
        />
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
