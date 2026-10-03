import type { SVGAttributes } from "react";
import type { Shape } from "./mapping";

/** Draws a source shape where the viewport shows it: an exact ellipse, or its visible path. */
export function MappedShape({
  shape,
  ...props
}: { shape: Shape } & SVGAttributes<SVGElement>) {
  if ("path" in shape) {
    return <path d={shape.path} {...props} />;
  }
  const {
    center: [cx, cy],
    radii: [rx, ry],
    angle,
  } = shape.ellipse;
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      transform={`rotate(${angle} ${cx} ${cy})`}
      {...props}
    />
  );
}
