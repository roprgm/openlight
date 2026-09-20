// Coverage of one gradient at a source-pixel position: 1 at a linear start or inside a radial
// ellipse, 0 past the linear end or the feathered radial edge. Kind 1 is linear, 2 radial.
export fn gradientCoverage(position: vec2f, first: vec2f, second: vec2f, kind: u32, feather: f32, angle: f32) -> f32 {
 if (kind == 2u) {
  let delta = position - first;
  let local = vec2f(cos(angle) * delta.x + sin(angle) * delta.y, -sin(angle) * delta.x + cos(angle) * delta.y);
  return 1.0 - smoothstep(1.0 - max(feather, 0.0001), 1.0, length(local / second));
 }
 let direction = second - first;
 return 1.0 - clamp(dot(position - first, direction) / dot(direction, direction), 0.0, 1.0);
}
