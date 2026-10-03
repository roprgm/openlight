import {
  correctedOffset,
  correction,
  type ImageFrame,
  type Point,
} from "@/core/image/frame";
import { clamp } from "@/lib/math";
import { apply, type Homography } from "@/lib/projective";

/** A half-plane a·x + b·y + c ≥ 0 with a unit normal, so its value is a distance. */
type Edge = readonly [number, number, number];

/** A point of the photo stays in front of the correction's horizon, so its weight is positive. */
function map(matrix: Homography, point: Point): Point {
  const [x, y, w] = apply(matrix, point);
  return [x / w, y / w];
}

/**
 * The photo in corrected pixels: a corrected point lies inside these half-planes exactly when its
 * source lies inside the photo. Without perspective they are the photo's edges.
 */
function edges(frame: ImageFrame, source: Point): Edge[] {
  const matrix = correction(frame, source, true);
  const [x, y, w] = [0, 3, 6].map((row) => matrix.slice(row, row + 3));
  return [
    x,
    w.map((value, i) => source[0] * value - x[i]),
    y,
    w.map((value, i) => source[1] * value - y[i]),
  ].map(([a, b, c]) => {
    const length = Math.hypot(a, b);
    return [a / length, b / length, c / length] as const;
  });
}

function distance(edge: Edge, [x, y]: Point) {
  return edge[0] * x + edge[1] * y + edge[2];
}

/** Corner offsets from the center, in corrected pixels, always in the same order. */
function corners(frame: ImageFrame) {
  return [-1, 1].flatMap((x) =>
    [-1, 1].map((y) =>
      correctedOffset(frame, (x * frame.size[0]) / 2, (y * frame.size[1]) / 2),
    ),
  );
}

/**
 * The closest point to `point` inside the half-planes, which hold `inside`: the point itself, its
 * projection onto an edge, or a corner where two edges meet.
 */
function nearest(point: Point, planes: readonly Edge[], inside: Point): Point {
  const holds = (candidate: Point) =>
    planes.every((plane) => distance(plane, candidate) >= -1e-7);
  const candidates = planes.flatMap((plane, i): Point[] => {
    const away = distance(plane, point);
    const vertices = planes.slice(i + 1).flatMap((other): Point[] => {
      const determinant = plane[0] * other[1] - plane[1] * other[0];
      if (!determinant) return [];
      return [
        [
          (plane[1] * other[2] - other[1] * plane[2]) / determinant,
          (other[0] * plane[2] - plane[0] * other[2]) / determinant,
        ],
      ];
    });
    return [
      [point[0] - away * plane[0], point[1] - away * plane[1]],
      ...vertices,
    ];
  });
  const length = (candidate: Point) =>
    Math.hypot(candidate[0] - point[0], candidate[1] - point[1]);
  return [point, ...candidates]
    .filter(holds)
    .reduce(
      (best, candidate) =>
        length(candidate) < length(best) ? candidate : best,
      inside,
    );
}

/** Translation slides along the photo's edges, to the nearest center that keeps it covered. */
export function move(
  frame: ImageFrame,
  dx: number,
  dy: number,
  source: Point,
): ImageFrame {
  const offset = correctedOffset(frame, dx, dy);
  const reach = corners(frame);
  // Where the center may go: each edge, moved in by the corner that reaches furthest across it.
  const planes = edges(frame, source).map(
    ([a, b, c]): Edge => [
      a,
      b,
      c + Math.min(...reach.map(([x, y]) => a * x + b * y)),
    ],
  );
  return {
    ...frame,
    center: nearest(
      [frame.center[0] + offset[0], frame.center[1] + offset[1]],
      planes,
      frame.center,
    ),
  };
}

/** Anchor the opposite source edge or corner, stopping the gesture at the first bound. */
export function resize(
  frame: ImageFrame,
  handle: string,
  dx: number,
  dy: number,
  ratio: number | null,
  source: Point,
): ImageFrame {
  const sx = Number(handle.includes("e")) - Number(handle.includes("w"));
  const sy = Number(handle.includes("s")) - Number(handle.includes("n"));
  const xWeight = Math.abs(sx);
  const yWeight = Math.abs(sy);
  const width = frame.size[0] + sx * dx;
  const height = frame.size[1] + sy * dy;
  const w = ratio
    ? Math.max(
        1,
        ratio,
        ((width * ratio * xWeight + height * yWeight) * ratio) /
          (ratio * ratio * xWeight + yWeight),
      )
    : Math.max(1, width);
  const h = ratio ? w / ratio : Math.max(1, height);
  const offset = correctedOffset(
    frame,
    ((w - frame.size[0]) * sx) / 2,
    ((h - frame.size[1]) * sy) / 2,
  );
  const center: Point = [
    frame.center[0] + offset[0],
    frame.center[1] + offset[1],
  ];
  const before = corners(frame);
  const after = corners({ ...frame, size: [w, h] });
  // Corners move in straight lines, so each edge allows a fraction of the way.
  let fraction = 1;
  for (const edge of edges(frame, source)) {
    for (const [i, [x, y]] of before.entries()) {
      const start = distance(edge, [frame.center[0] + x, frame.center[1] + y]);
      const end = distance(edge, [
        center[0] + after[i][0],
        center[1] + after[i][1],
      ]);
      if (end < -1e-7) {
        fraction = Math.min(fraction, clamp(start / (start - end)));
      }
    }
  }
  const blend = (a: number, b: number) => a + (b - a) * fraction;
  return {
    ...frame,
    size: [blend(frame.size[0], w), blend(frame.size[1], h)],
    center: [
      frame.center[0] + offset[0] * fraction,
      frame.center[1] + offset[1] * fraction,
    ],
  };
}

/** Magnify around the current center only as much as coverage requires. */
function cover(frame: ImageFrame, source: Point): ImageFrame {
  const reach = corners(frame);
  let fit = 1;
  for (const edge of edges(frame, source)) {
    const room = distance(edge, frame.center);
    for (const [x, y] of reach) {
      const across = edge[0] * x + edge[1] * y;
      if (across < 0) {
        fit = Math.min(fit, room / -across);
      }
    }
  }
  return { ...frame, scale: [frame.scale[0] * fit, frame.scale[1] * fit] };
}

/** Straightens from the unmagnified frame, so turning back restores it. */
export function rotate(
  frame: ImageFrame,
  angle: number,
  source: Point,
): ImageFrame {
  return cover(
    {
      ...frame,
      angle,
      scale: [Math.sign(frame.scale[0]), Math.sign(frame.scale[1])],
    },
    source,
  );
}

/**
 * Corrects perspective from the unmagnified frame, keeping the source pixel under the center there,
 * which keeps the center inside the photo.
 */
export function correct(
  frame: ImageFrame,
  perspective: Point,
  source: Point,
): ImageFrame {
  const anchor = map(correction(frame, source, true), frame.center);
  const next = { ...frame, perspective };
  return rotate(
    { ...next, center: map(correction(next, source), anchor) },
    frame.angle,
    source,
  );
}

/** For each quarter turn clockwise, the source axis each displayed axis shows and its direction. */
const quarters = [
  [
    [0, 1],
    [1, 1],
  ],
  [
    [1, -1],
    [0, 1],
  ],
  [
    [0, -1],
    [1, -1],
  ],
  [
    [1, 1],
    [0, -1],
  ],
] as const;

/** The source axis behind each displayed one and its direction, after the frame's turn and flips. */
function orientation(frame: ImageFrame) {
  const quarter = ((Math.round(frame.rotation / 90) % 4) + 4) % 4;
  return quarters[quarter].map(
    ([axis, sign], i) => [axis, sign * Math.sign(frame.scale[i])] as const,
  );
}

function signed(sign: number, value: number) {
  return sign > 0 ? value : 0 - value;
}

/** The perspective along the displayed axes, horizontal then vertical, as quarter turns and flips show it. */
export function shownPerspective(frame: ImageFrame): Point {
  const [x, y] = orientation(frame);
  return [
    signed(x[1], frame.perspective[x[0]]),
    signed(y[1], frame.perspective[y[0]]),
  ];
}

/** Corrects perspective given along the displayed axes. */
export function correctShown(
  frame: ImageFrame,
  shown: Point,
  source: Point,
): ImageFrame {
  const perspective: [number, number] = [0, 0];
  for (const [i, [axis, sign]] of orientation(frame).entries()) {
    perspective[axis] = signed(sign, shown[i]);
  }
  return correct(frame, perspective, source);
}

export function turn(frame: ImageFrame, direction: number): ImageFrame {
  return {
    ...frame,
    rotation: (frame.rotation + direction * 90 + 360) % 360,
    size: [frame.size[1], frame.size[0]],
    scale: [frame.scale[1], frame.scale[0]],
  };
}

export function flip(frame: ImageFrame, axis: number): ImageFrame {
  const [x, y] = frame.scale;
  return { ...frame, scale: axis === 0 ? [-x, y] : [x, -y] };
}

export function fitRatio(frame: ImageFrame, ratio: number): ImageFrame {
  const width = Math.max(
    1,
    ratio,
    Math.min(frame.size[0], frame.size[1] * ratio),
  );
  // Keep one output pixel per axis without expanding source coverage.
  const scale = Math.min(
    1,
    frame.size[0] / width,
    (frame.size[1] * ratio) / width,
  );
  return {
    ...frame,
    size: [width, width / ratio],
    scale: [frame.scale[0] * scale, frame.scale[1] * scale],
  };
}
