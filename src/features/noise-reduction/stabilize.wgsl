// The mosaic's noise model per 2 × 2 cell position, and the transforms between sensor samples and the
// filter's spectrum, where noise is unit Gaussian everywhere.

export struct Noise {
  // The positions of red, the two greens, and blue.
  order: vec4u,
  black: vec4f,
  // A sample x above black varies by gain · x + floor.
  gain: vec4f,
  floor: vec4f,
}

// Orthonormal, so unit noise stays unit noise: light, then green against magenta, red against blue,
// and the two greens' difference, which holds little more than noise.
const spectrum = mat4x4f(
  0.5, 0.5, 0.70710678, 0.0,
  0.5, -0.5, 0.0, 0.70710678,
  0.5, -0.5, 0.0, -0.70710678,
  0.5, 0.5, -0.70710678, 0.0,
);

// The lowest value the transform takes, at x = −c/a, below which the model allows no sample: dead
// pixels lie there. Unbounded without photon noise.
fn lowest(noise: Noise) -> vec4f {
  let root = sqrt(0.375 * noise.gain * noise.gain + noise.floor);
  return select(vec4f(-3.4e38), -2.0 * root / noise.gain, noise.gain > vec4f(0.0));
}

// The generalized Anscombe transform 2/a · (√(a·x + c) − √c), with c = 3/8 · a² + b, of samples
// above black, written so it keeps its precision as the gain goes to zero. Zero at black, which
// keeps half floats precise.
export fn stabilize(x: vec4f, noise: Noise) -> vec4f {
  let c = 0.375 * noise.gain * noise.gain + noise.floor;
  return max(2.0 * x / (sqrt(max(noise.gain * x + c, vec4f(0.0))) + sqrt(c)), lowest(noise));
}

// The inverse that is unbiased for Poisson-Gaussian noise, in the closed form of Mäkitalo and Foi
// (2013): the algebraic inverse plus a correction in powers of 1 / D, where D is the transform
// measured from its own zero.
export fn unstabilize(value: vec4f, noise: Noise) -> vec4f {
  let a = noise.gain;
  let root = sqrt(0.375 * a * a + noise.floor);
  let z = max(value, lowest(noise));
  let u = clamp(a / (a * z + 2.0 * root), vec4f(0.0), vec4f(1.0));
  let correction = 0.25 + u * (0.30618622 + u * (-1.375 + u * 0.76546554));
  return root * z + 0.25 * a * z * z + a * correction;
}

// Stabilized samples by position into the spectrum.
export fn toSpectrum(z: vec4f, noise: Noise) -> vec4f {
  let o = noise.order;
  return spectrum * vec4f(z[o.x], z[o.y], z[o.z], z[o.w]);
}

// The spectrum back to stabilized samples by position.
export fn fromSpectrum(value: vec4f, noise: Noise) -> vec4f {
  let colors = value * spectrum;
  let o = noise.order;
  var z: vec4f;
  z[o.x] = colors.x;
  z[o.y] = colors.y;
  z[o.z] = colors.z;
  z[o.w] = colors.w;
  return z;
}
