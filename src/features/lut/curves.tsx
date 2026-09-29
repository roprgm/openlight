import type { LookupTable } from "@/core/document";

/** Screened together, the three channels draw white where the LUT keeps grays neutral. */
const channels = ["#ff4d4d", "#4dff4d", "#4d4dff"];

/** Each channel's output along the gray axis, as curve points in 0–1. */
function grayResponse({ size, table }: LookupTable, channel: number) {
  return Array.from({ length: size }, (_, i) => {
    const index = 3 * i * (1 + size + size * size) + channel;
    return `${i / (size - 1)},${1 - Math.min(Math.max(table[index], 0), 1)}`;
  }).join(" ");
}

/** A read-only view of what the LUT does to grays, one curve per channel. */
export function LutCurves({ lut }: { lut: LookupTable }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-muted">Gray response</h2>
      <svg
        role="img"
        aria-label="Each channel's output for grays from black to white"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="aspect-square max-h-45 w-full overflow-visible rounded bg-field"
      >
        <path
          d="M.25 0V1M.5 0V1M.75 0V1M0 .25H1M0 .5H1M0 .75H1"
          stroke="white"
          strokeOpacity="0.07"
          vectorEffect="non-scaling-stroke"
        />
        {channels.map((color, channel) => (
          <polyline
            key={color}
            points={grayResponse(lut, channel)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className="mix-blend-screen"
          />
        ))}
      </svg>
    </section>
  );
}
