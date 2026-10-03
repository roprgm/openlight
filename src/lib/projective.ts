/** Plane projective geometry on homogeneous coordinates. */

export type Point = readonly [number, number];
/** A 3×3 matrix in row-major order, acting on homogeneous column vectors. */
export type Homography = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
/** An ellipse with its radii along its own axes, turned by `angle` degrees. */
export type Ellipse = { center: Point; radii: Point; angle: number };

export function multiply(a: Homography, b: Homography): Homography {
  const at = (row: number, column: number) =>
    a[row * 3] * b[column] +
    a[row * 3 + 1] * b[3 + column] +
    a[row * 3 + 2] * b[6 + column];
  return [
    at(0, 0),
    at(0, 1),
    at(0, 2),
    at(1, 0),
    at(1, 1),
    at(1, 2),
    at(2, 0),
    at(2, 1),
    at(2, 2),
  ];
}

/** The homogeneous image of a point: x and y, and the weight that divides them. */
export function apply(
  matrix: Homography,
  [x, y]: Point,
): [number, number, number] {
  return [
    matrix[0] * x + matrix[1] * y + matrix[2],
    matrix[3] * x + matrix[4] * y + matrix[5],
    matrix[6] * x + matrix[7] * y + matrix[8],
  ];
}

/** The image of a point in front of the horizon, where the weight is positive. */
export function project(matrix: Homography, point: Point): Point | undefined {
  const [x, y, w] = apply(matrix, point);
  return w > 0 ? [x / w, y / w] : undefined;
}

/** The map's derivative at a point, by rows: how each image coordinate changes along x and y. */
export function jacobian(matrix: Homography, point: Point): [Point, Point] {
  const [x, y, w] = apply(matrix, point);
  const row = (i: number, at: number): Point => [
    (matrix[i * 3] - at * matrix[6]) / w,
    (matrix[i * 3 + 1] - at * matrix[7]) / w,
  ];
  return [row(0, x / w), row(1, y / w)];
}

/** The most a linear map lengthens any direction: its largest singular value. */
export function stretch([[a, b], [c, d]]: readonly [Point, Point]) {
  const sum = a * a + b * b + c * c + d * d;
  const determinant = a * d - b * c;
  return Math.sqrt(
    (sum + Math.sqrt(Math.max(0, sum * sum - 4 * determinant ** 2))) / 2,
  );
}

function ellipsePoint({ center, radii, angle }: Ellipse, t: number): Point {
  const turn = (angle * Math.PI) / 180;
  const x = radii[0] * Math.cos(t);
  const y = radii[1] * Math.sin(t);
  return [
    center[0] + x * Math.cos(turn) - y * Math.sin(turn),
    center[1] + x * Math.sin(turn) + y * Math.cos(turn),
  ];
}

/**
 * The image of an ellipse, exactly, given `inverse`, the map back to the ellipse's plane: a conic
 * C maps to inverseᵀ C inverse. Undefined unless the image is an ellipse in front of the horizon;
 * one that reaches the horizon is unbounded.
 */
export function projectEllipse(
  inverse: Homography,
  { center, radii, angle }: Ellipse,
): Ellipse | undefined {
  const turn = (angle * Math.PI) / 180;
  const w = inverse.slice(6, 9);
  const dx = inverse.slice(0, 3).map((value, i) => value - center[0] * w[i]);
  const dy = inverse.slice(3, 6).map((value, i) => value - center[1] * w[i]);
  // Rows giving a point's coordinates along the ellipse's axes, over its radii.
  const u = dx.map(
    (x, i) => (x * Math.cos(turn) + dy[i] * Math.sin(turn)) / radii[0],
  );
  const v = dx.map(
    (x, i) => (dy[i] * Math.cos(turn) - x * Math.sin(turn)) / radii[1],
  );
  const conic = (i: number, j: number) =>
    u[i] * u[j] + v[i] * v[j] - w[i] * w[j];
  const [a, b, c] = [conic(0, 0), conic(0, 1), conic(1, 1)];
  const [d, e, f] = [conic(0, 2), conic(1, 2), conic(2, 2)];
  const determinant = a * c - b * b;
  if (!(a > 0 && determinant > 0)) {
    return undefined;
  }
  const cx = (b * e - c * d) / determinant;
  const cy = (b * d - a * e) / determinant;
  const level = -(d * cx + e * cy + f);
  // An ellipse of points behind the horizon is the image of nothing in front of it.
  if (!(level > 0 && w[0] * cx + w[1] * cy + w[2] > 0)) {
    return undefined;
  }
  const mean = (a + c) / 2;
  const spread = Math.hypot((a - c) / 2, b);
  return {
    center: [cx, cy],
    radii: [
      Math.sqrt(level / (mean + spread)),
      Math.sqrt(level / (mean - spread)),
    ],
    angle: (Math.atan2(2 * b, a - c) * 90) / Math.PI,
  };
}

/**
 * Points along a curve's image, within `tolerance` of it: each piece halves until its middle lies
 * that close to its chord. `point` must be finite over [from, to].
 */
function trace(
  point: (t: number) => Point,
  from: number,
  to: number,
  tolerance: number,
) {
  const points = [point(from)];
  function divide(t0: number, p0: Point, t1: number, p1: Point, depth: number) {
    const t = (t0 + t1) / 2;
    const middle = point(t);
    const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const away = chord
      ? Math.abs(
          (p1[0] - p0[0]) * (middle[1] - p0[1]) -
            (p1[1] - p0[1]) * (middle[0] - p0[0]),
        ) / chord
      : Math.hypot(middle[0] - p0[0], middle[1] - p0[1]);
    if (depth < 12 && away > tolerance) {
      divide(t0, p0, t, middle, depth + 1);
      divide(t, middle, t1, p1, depth + 1);
      return;
    }
    points.push(p1);
  }
  const pieces = 32;
  for (let i = 0; i < pieces; i++) {
    const t0 = from + ((to - from) * i) / pieces;
    const t1 = from + ((to - from) * (i + 1)) / pieces;
    divide(t0, points[points.length - 1], t1, point(t1), 0);
  }
  return points;
}

function pathData(points: readonly Point[]) {
  return `${points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("")}Z`;
}

/**
 * The part of an ellipse's image where `matrix`'s weight stays at least `floor`, as closed SVG path
 * data within `tolerance` of the curve: a straight edge closes it where the weight reaches `floor`.
 * Empty when nothing is left.
 */
export function ellipsePath(
  matrix: Homography,
  ellipse: Ellipse,
  floor: number,
  tolerance = 0.25,
) {
  // The weight along the ellipse is level + depth·cos(t − phase).
  const [x0, y0] = ellipsePoint(ellipse, 0);
  const [x1, y1] = ellipsePoint(ellipse, Math.PI / 2);
  const weight = ([x, y]: Point) => matrix[6] * x + matrix[7] * y + matrix[8];
  const level = weight(ellipse.center);
  const cosine = weight([x0, y0]) - level;
  const sine = weight([x1, y1]) - level;
  const depth = Math.hypot(cosine, sine);
  if (level + depth < floor) {
    return "";
  }
  const phase = Math.atan2(sine, cosine);
  const reach =
    level - depth >= floor ? Math.PI : Math.acos((floor - level) / depth);
  const point = (t: number) => {
    const [x, y, w] = apply(matrix, ellipsePoint(ellipse, t));
    return [x / w, y / w] as const;
  };
  return pathData(trace(point, phase - reach, phase + reach, tolerance));
}

/**
 * A polygon's image where `matrix`'s weight stays at least `floor`, as closed SVG path data; its
 * edges stay straight. Empty when nothing is left.
 */
export function polygonPath(
  matrix: Homography,
  polygon: readonly Point[],
  floor: number,
) {
  const weight = ([x, y]: Point) => matrix[6] * x + matrix[7] * y + matrix[8];
  const kept: Point[] = [];
  for (const [i, point] of polygon.entries()) {
    const next = polygon[(i + 1) % polygon.length];
    const [a, b] = [weight(point) - floor, weight(next) - floor];
    if (a >= 0) kept.push(point);
    if (a >= 0 !== b >= 0) {
      const t = a / (a - b);
      kept.push([
        point[0] + (next[0] - point[0]) * t,
        point[1] + (next[1] - point[1]) * t,
      ]);
    }
  }
  if (kept.length < 3) {
    return "";
  }
  return pathData(
    kept.map((point) => {
      const [x, y, w] = apply(matrix, point);
      return [x / w, y / w] as const;
    }),
  );
}
