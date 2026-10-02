import { useId } from "react";
import type { Point } from "@/core/image/frame";

/** The active brush's size, feather, and center in viewport pixels. */
export function BrushCursor({
  at,
  radius,
  feather,
  erase,
  preview,
}: {
  at: Point;
  radius: number;
  feather: number;
  erase: boolean;
  preview: boolean;
}) {
  const gradient = useId();
  const color = erase ? "black" : "white";
  const dash = erase ? "4 3" : undefined;
  const center = `M${at[0] - 4} ${at[1]}h8M${at[0]} ${at[1] - 4}v8`;
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
      <circle
        cx={at[0]}
        cy={at[1]}
        r={Math.max(2, radius)}
        fill={`url(#${gradient})`}
        stroke="white"
        strokeOpacity="0.9"
        strokeDasharray={dash}
      />
      <circle
        cx={at[0]}
        cy={at[1]}
        r={Math.max(2, radius)}
        fill="none"
        stroke="black"
        strokeOpacity="0.5"
        strokeWidth="3"
        strokeDasharray={dash}
        style={{ paintOrder: "stroke" }}
      />
      {radius > 50 && (
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
