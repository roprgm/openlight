import { useId } from "react";
import type { BrushStroke } from "@/core/document";

function StrokeShape({
  stroke,
  points,
}: {
  stroke: BrushStroke;
  points: string;
}) {
  return (
    <>
      <polyline
        points={points}
        fill="none"
        stroke="white"
        strokeWidth={stroke.size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={stroke.points[0][0]}
        cy={stroke.points[0][1]}
        r={stroke.size / 2}
        fill="white"
      />
    </>
  );
}

/** A document-independent miniature of the painted patch shape. */
export function PatchThumbnail({
  stroke,
  feather,
  opacity,
}: {
  stroke: BrushStroke;
  feather: number;
  opacity: number;
}) {
  const filter = useId();
  const mask = useId();
  const xs = stroke.points.map(([x]) => x);
  const ys = stroke.points.map(([, y]) => y);
  const radius = stroke.size / 2;
  const blur = (stroke.size * feather) / 6;
  const extent = blur * 3;
  const left = Math.min(...xs) - radius;
  const top = Math.min(...ys) - radius;
  const width = Math.max(1, Math.max(...xs) - Math.min(...xs) + stroke.size);
  const height = Math.max(1, Math.max(...ys) - Math.min(...ys) + stroke.size);
  const padding = Math.max(width, height) / 28;
  const points = stroke.points.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg
      aria-label="Patch shape"
      role="img"
      viewBox={`${left - padding} ${top - padding} ${width + padding * 2} ${height + padding * 2}`}
      className="size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950"
    >
      <defs>
        <mask
          id={mask}
          x={left}
          y={top}
          width={width}
          height={height}
          maskUnits="userSpaceOnUse"
        >
          <StrokeShape stroke={stroke} points={points} />
        </mask>
        {blur > 0 && (
          <filter
            id={filter}
            x={left - extent}
            y={top - extent}
            width={width + extent * 2}
            height={height + extent * 2}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation={blur} />
          </filter>
        )}
      </defs>
      <g opacity={opacity} mask={`url(#${mask})`}>
        <g filter={blur > 0 ? `url(#${filter})` : undefined}>
          <StrokeShape stroke={stroke} points={points} />
        </g>
      </g>
    </svg>
  );
}
