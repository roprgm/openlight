import { MappedShape } from "@/components/editor/mapped-shape";
import type { DocumentMapping } from "@/components/editor/mapping";
import { rotateCursor } from "@/components/icons/rotate-cursor";
import type { Gradient, LinearGradient, RadialGradient } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { type GradientHandle, radialPoint } from "./gradient";

const rotationCursor = rotateCursor();

function resizeCursor(from: Point, to: Point) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const direction = (Math.round(angle / (Math.PI / 4)) + 4) % 4;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][direction];
}

function Handle({
  point,
  handle,
  label,
  cursor = "grab",
}: {
  point: Point;
  handle: GradientHandle;
  label: string;
  cursor?: string;
}) {
  return (
    <g className="group/handle" style={{ cursor }}>
      <title>{label}</title>
      <circle
        cx={point[0]}
        cy={point[1]}
        r="12"
        fill="transparent"
        data-gradient-handle={handle}
        aria-label={label}
        className="pointer-events-auto"
      />
      <circle
        cx={point[0]}
        cy={point[1]}
        r="4"
        fill="white"
        stroke="#171717"
        className="group-hover/handle:fill-sky-300"
      />
    </g>
  );
}

function Guide({
  point,
  direction,
  handle,
  cursor,
}: {
  point: Point;
  direction: Point;
  handle: GradientHandle;
  cursor: string;
}) {
  const line = {
    x1: point[0] - direction[0],
    y1: point[1] - direction[1],
    x2: point[0] + direction[0],
    y2: point[1] + direction[1],
  };
  return (
    <g>
      <line {...line} stroke="black" strokeOpacity="0.6" strokeWidth="3" />
      <line {...line} stroke="white" strokeOpacity="0.9" />
      <line
        {...line}
        stroke="transparent"
        strokeWidth="16"
        data-gradient-handle={handle}
        aria-label={`Gradient ${handle} guide`}
        className="[pointer-events:stroke]"
        style={{ cursor }}
      />
    </g>
  );
}

/**
 * Lines of equal coverage through the start, end, and middle, across the gradient in the photo; they
 * stay straight as perspective maps them, though no longer parallel.
 */
function LinearGuides({
  mask,
  mapping,
  extent,
}: {
  mask: LinearGradient;
  mapping: DocumentMapping;
  extent: number;
}) {
  const along: Point = [
    mask.end[0] - mask.start[0],
    mask.end[1] - mask.start[1],
  ];
  const across: Point = [-along[1], along[0]];
  /** A guide where its point shows, with the gradient's direction there for its cursor. */
  function guide(point: Point) {
    const at = mapping.toScreen(point);
    if (!at) return undefined;
    const [dx, dy] = mapping.direction(point, across);
    const length = Math.max(1, Math.hypot(dx, dy));
    const direction: Point = [(dx / length) * extent, (dy / length) * extent];
    const cursor = resizeCursor([0, 0], mapping.direction(point, along));
    return { at, direction, cursor };
  }
  const start = guide(mask.start);
  const end = guide(mask.end);
  const middle = guide([
    (mask.start[0] + mask.end[0]) / 2,
    (mask.start[1] + mask.end[1]) / 2,
  ]);
  return (
    <g>
      <title>Linear gradient guides</title>
      {start && (
        <Guide
          point={start.at}
          direction={start.direction}
          handle="start"
          cursor={start.cursor}
        />
      )}
      {end && (
        <Guide
          point={end.at}
          direction={end.direction}
          handle="end"
          cursor={end.cursor}
        />
      )}
      {middle && (
        <>
          <Guide
            point={middle.at}
            direction={middle.direction}
            handle="rotate"
            cursor={rotationCursor}
          />
          <Handle point={middle.at} handle="move" label="Move gradient" />
        </>
      )}
    </g>
  );
}

function RadialGuides({
  mask,
  mapping,
}: {
  mask: RadialGradient;
  mapping: DocumentMapping;
}) {
  const at = (x: number, y: number) => radialPoint(mask, x, y);
  const screen = (x: number, y: number) => mapping.toScreen(at(x, y));
  /** The viewport direction, where a point of the ellipse shows, of its radius through that point. */
  function radius(x: number, y: number) {
    const [px, py] = at(x, y);
    return mapping.direction(at(x, y), [
      px - mask.center[0],
      py - mask.center[1],
    ]);
  }
  /** A radius handle's cursor, along its radius as shown there. */
  const resize = (x: number, y: number) => resizeCursor([0, 0], radius(x, y));
  const center = mapping.toScreen(mask.center);
  const right = screen(1, 0);
  const left = screen(-1, 0);
  const bottom = screen(0, 1);
  const top = screen(0, -1);
  const feather = screen(1 - mask.feather, 0);
  // About 24 viewport pixels past the top.
  const rotation = screen(
    0,
    -1 - 24 / Math.max(1, Math.hypot(...radius(0, -1))),
  );
  const apart = (point: Point, other?: Point) =>
    !other || Math.hypot(point[0] - other[0], point[1] - other[1]) >= 24;
  const edge = mapping.ellipse({
    center: mask.center,
    radii: mask.radius,
    angle: mask.angle,
  });
  const inner = mapping.ellipse({
    center: mask.center,
    radii: [
      mask.radius[0] * (1 - mask.feather),
      mask.radius[1] * (1 - mask.feather),
    ],
    angle: mask.angle,
  });
  // Each part shows where it maps, so a mask reaching past the perspective's horizon keeps the rest.
  return (
    <g>
      <title>Radial gradient guides</title>
      <g fill="none" stroke="white">
        {edge && (
          <>
            <MappedShape
              shape={edge}
              fill="transparent"
              stroke="none"
              data-gradient-handle="move"
              aria-label="Move radial gradient"
              className="pointer-events-auto cursor-grab hover:fill-hover"
            />
            <MappedShape
              shape={edge}
              stroke="black"
              strokeOpacity="0.6"
              strokeWidth="3"
            />
            <MappedShape shape={edge} strokeOpacity="0.9" />
          </>
        )}
        {inner && (
          <MappedShape
            shape={inner}
            strokeDasharray="4 3"
            strokeOpacity="0.8"
          />
        )}
        {top && rotation && (
          <line x1={top[0]} y1={top[1]} x2={rotation[0]} y2={rotation[1]} />
        )}
      </g>
      {center && <Handle point={center} handle="move" label="Move gradient" />}
      {right && (
        <Handle
          point={right}
          handle="radius-x"
          label="Radial right radius"
          cursor={resize(1, 0)}
        />
      )}
      {left && (
        <Handle
          point={left}
          handle="radius-x"
          label="Radial left radius"
          cursor={resize(-1, 0)}
        />
      )}
      {bottom && (
        <Handle
          point={bottom}
          handle="radius-y"
          label="Radial bottom radius"
          cursor={resize(0, 1)}
        />
      )}
      {top && (
        <Handle
          point={top}
          handle="radius-y"
          label="Radial top radius"
          cursor={resize(0, -1)}
        />
      )}
      {rotation && (
        <Handle
          point={rotation}
          handle="rotate"
          label="Rotate radial gradient"
          cursor={rotationCursor}
        />
      )}
      {feather && apart(feather, center) && apart(feather, right) && (
        <Handle
          point={feather}
          handle="feather"
          label="Radial feather"
          cursor={resize(1, 0)}
        />
      )}
    </g>
  );
}

export function GradientGuides({
  mask,
  mapping,
  extent,
}: {
  mask: Gradient;
  mapping: DocumentMapping;
  extent: number;
}) {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
      <title>Gradient guides</title>
      {mask.kind === "linear" && (
        <LinearGuides mask={mask} mapping={mapping} extent={extent} />
      )}
      {mask.kind === "radial" && <RadialGuides mask={mask} mapping={mapping} />}
    </svg>
  );
}
