import type { BrushStroke } from "@/core/document";

/** A document-independent miniature of the painted patch shape. */
export function PatchThumbnail({
  stroke,
  feather,
}: {
  stroke: BrushStroke;
  feather: number;
}) {
  const xs = stroke.points.map(([x]) => x);
  const ys = stroke.points.map(([, y]) => y);
  const radius = stroke.size / 2;
  const left = Math.min(...xs) - radius;
  const top = Math.min(...ys) - radius;
  const width = Math.max(1, Math.max(...xs) - Math.min(...xs) + stroke.size);
  const height = Math.max(1, Math.max(...ys) - Math.min(...ys) + stroke.size);
  const points = stroke.points.map(([x, y]) => `${x},${y}`).join(" ");
  const inner = Math.max(0, stroke.size * (1 - feather));
  return (
    <svg
      aria-label="Patch shape"
      role="img"
      viewBox={`${left} ${top} ${width} ${height}`}
      className="size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950"
    >
      <polyline
        points={points}
        fill="none"
        stroke="#737373"
        strokeWidth={stroke.size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {inner > 0 && (
        <polyline
          points={points}
          fill="none"
          stroke="#d4d4d4"
          strokeWidth={inner}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <circle
        cx={stroke.points[0][0]}
        cy={stroke.points[0][1]}
        r={radius}
        fill="#737373"
      />
      {inner > 0 && (
        <circle
          cx={stroke.points[0][0]}
          cy={stroke.points[0][1]}
          r={inner / 2}
          fill="#d4d4d4"
        />
      )}
    </svg>
  );
}
