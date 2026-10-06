// An image is filtered in the sRGB transfer's encoding, where noise varies far less with light than
// in linear, extended past 0 and 1 by symmetry and its own curve; and in an orthonormal basis of
// light and two color differences, so noise keeps its deviation in each.

export fn encode(x: vec3f) -> vec3f {
  let a = abs(x);
  return sign(x) * select(1.055 * pow(a, vec3f(1.0 / 2.4)) - 0.055, 12.92 * a, a <= vec3f(0.0031308));
}

export fn decode(e: vec3f) -> vec3f {
  let a = abs(e);
  return sign(e) * select(pow((a + 0.055) / 1.055, vec3f(2.4)), a / 12.92, a <= vec3f(0.04045));
}

// Light, red against blue, and green against magenta.
const opponent = mat3x3f(
  0.57735027, 0.70710678, 0.40824829,
  0.57735027, 0.0, -0.81649658,
  0.57735027, -0.70710678, 0.40824829,
);

export fn toOpponent(rgb: vec3f) -> vec3f {
  return opponent * rgb;
}

export fn fromOpponent(value: vec3f) -> vec3f {
  return value * opponent;
}

// Each 2 × 2 cell's four values, row-major, and its mean, horizontal, vertical, and diagonal
// differences, one to the other: orthonormal, so noise keeps its deviation, and its own inverse.
export const haar = mat4x4f(
  0.5, 0.5, 0.5, 0.5,
  0.5, -0.5, 0.5, -0.5,
  0.5, 0.5, -0.5, -0.5,
  0.5, -0.5, -0.5, 0.5,
);
