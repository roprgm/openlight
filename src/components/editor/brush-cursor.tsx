import { useId } from "react";
import type { Point } from "@/core/image/frame";
import { MappedShape } from "./mapped-shape";
import type { Shape } from "./mapping";

/**
 * The dab the active brush lays at the pointer, as the viewport shows it, with its feather and center.
 * With perspective the outline is the dab's exact image; the feather shading only follows it.
 */
export function BrushCursor({
  at,
  dab,
  feather,
  erase,
  preview,
}: {
  at: Point;
  dab: Shape;
  feather: number;
  erase: boolean;
  preview: boolean;
}) {
  const gradient = useId();
  const color = erase ? "black" : "white";
  const dash = erase ? "4 3" : undefined;
  const center = `M${at[0] - 4} ${at[1]}h8M${at[0]} ${at[1] - 4}v8`;
  // A dab smaller than the ring still shows one.
  const shape: Shape =
    "ellipse" in dab
      ? {
          ellipse: {
            ...dab.ellipse,
            radii: [
              Math.max(2, dab.ellipse.radii[0]),
              Math.max(2, dab.ellipse.radii[1]),
            ],
          },
        }
      : dab;
  // Wider than 100 visible pixels, so rounding in the projection never tips a 100 px brush over.
  const wide =
    "path" in dab ||
    Math.round(2 * Math.sqrt(dab.ellipse.radii[0] * dab.ellipse.radii[1])) >
      100;
  return (
    <svg
      aria-hidden="true"
      data-brush-cursor="true"
      data-preview={preview}
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <defs>
        {/* Solid inside the feather, fading to the edge. */}
        <radialGradient id={gradient} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={color} stopOpacity="0.3" />
          <stop offset={1 - feather} stopColor={color} stopOpacity="0.3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <MappedShape
        shape={shape}
        fill={`url(#${gradient})`}
        stroke="white"
        strokeOpacity="0.9"
        strokeDasharray={dash}
      />
      <MappedShape
        shape={shape}
        fill="none"
        stroke="black"
        strokeOpacity="0.5"
        strokeWidth="3"
        strokeDasharray={dash}
        style={{ paintOrder: "stroke" }}
      />
      {wide && (
        <g data-brush-center="true" fill="none">
          <path d={center} stroke="white" strokeOpacity="0.9" />
          <path
            d={center}
            stroke="black"
            strokeOpacity="0.5"
            strokeWidth="3"
            style={{ paintOrder: "stroke" }}
          />
        </g>
      )}
    </svg>
  );
}
