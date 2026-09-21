import type { Gradient } from "@/core/document";

// Samples across the feather band follow the mix shader's smoothstep.
const samples = [0, 0.25, 0.5, 0.75, 1];

function coverageStops(mask: Gradient): [number, number][] {
  if (mask.kind === "linear") {
    return [
      [0, 1],
      [1, 0],
    ];
  }
  return samples.map((t) => [
    1 - mask.feather + t * mask.feather,
    1 - t * t * (3 - 2 * t),
  ]);
}

/** An SVG gradient in document coordinates whose opacity follows the mask's coverage. */
export function MaskFill({
  id,
  mask,
  color = "white",
  alpha = (coverage: number) => coverage,
}: {
  id: string;
  mask: Gradient;
  color?: string;
  alpha?: (coverage: number) => number;
}) {
  const stops = coverageStops(mask).map(([offset, coverage]) => (
    <stop
      key={`${offset}/${coverage}`}
      offset={offset}
      stopColor={color}
      stopOpacity={alpha(coverage)}
    />
  ));
  if (mask.kind === "radial") {
    const transform = `translate(${mask.center[0]} ${mask.center[1]}) rotate(${mask.angle}) scale(${mask.radius[0]} ${mask.radius[1]})`;
    return (
      <radialGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        cx="0"
        cy="0"
        r="1"
        gradientTransform={transform}
      >
        {stops}
      </radialGradient>
    );
  }
  return (
    <linearGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      x1={mask.start[0]}
      y1={mask.start[1]}
      x2={mask.end[0]}
      y2={mask.end[1]}
    >
      {stops}
    </linearGradient>
  );
}
