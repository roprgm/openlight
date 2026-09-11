// Adapted from GALOSH (Copyright 2026 luxgrain), Apache-2.0.
// Substantially modified for OpenLight; provenance and changes:
// /licenses/galosh/NOTICE; license: /licenses/galosh/LICENSE.
// Generalized Anscombe with a continuous linear extension for signed shadows.
// Subtracting the value at zero avoids a large DC offset when shot noise is tiny.
export fn stabilize(x: vec4f, shot: vec4f, read: vec4f) -> vec4f {
  let a = max(shot, vec4f(1e-12));
  let root = sqrt(read + 0.375 * a * a);
  let curved = 2.0 * x / (sqrt(max(a * x + root * root, vec4f(0.0))) + root);
  let boundary = -0.375 * a;
  let atBoundary = 2.0 * boundary / (sqrt(read) + root);
  return select(curved, atBoundary + (x - boundary) / sqrt(read), x < boundary);
}

export fn unstabilize(z: vec4f, shot: vec4f, read: vec4f) -> vec4f {
  let a = max(shot, vec4f(1e-12));
  let root = sqrt(read + 0.375 * a * a);
  let boundary = -0.375 * a;
  let atBoundary = 2.0 * boundary / (sqrt(read) + root);
  // Asymptotic variance correction: +a/4 relative to the algebraic inverse.
  // Fade near the linear extension; it is exactly linear when shot = 0.
  let x = z * (root + 0.25 * a * z);
  let correction = 0.25 * shot * smoothstep(atBoundary, atBoundary + vec4f(2.0), z);
  return select(x + correction, boundary + (z - atBoundary) * sqrt(read), z < atBoundary);
}

// Orthonormal transform across physical Bayer phases; its inverse is itself.
export fn opponent(v: vec4f) -> vec4f {
  return 0.5 * vec4f(v.x+v.y+v.z+v.w, v.x-v.y+v.z-v.w, v.x+v.y-v.z-v.w, v.x-v.y-v.z+v.w);
}
