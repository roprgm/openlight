import type { LookupTable } from "@/core/document";

/** Screened together, the three channels draw white where the LUT keeps grays neutral. */
const channels = ["#ff4d4d", "#4dff4d", "#4d4dff"];

const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toSrgb = (value: number) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

/** Each channel's output along the gray axis at `opacity`, which mixes in linear light as the renderer does. */
function grayResponse(
  { size, table }: LookupTable,
  channel: number,
  opacity: number,
) {
  return Array.from({ length: size }, (_, i) => {
    const input = i / (size - 1);
    const graded = Math.min(
      Math.max(table[3 * i * (1 + size + size * size) + channel], 0),
      1,
    );
    const linear =
      toLinear(input) + (toLinear(graded) - toLinear(input)) * opacity;
    return `${input},${1 - toSrgb(linear)}`;
  }).join(" ");
}

/** A read-only view of what the layer does to grays, one curve per channel. */
export function LutCurves({
  lut,
  opacity,
}: {
  lut: LookupTable;
  opacity: number;
}) {
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
            points={grayResponse(lut, channel, opacity)}
            fill="none"
            stroke={color}
            vectorEffect="non-scaling-stroke"
            className="mix-blend-screen"
          />
        ))}
      </svg>
    </section>
  );
}
