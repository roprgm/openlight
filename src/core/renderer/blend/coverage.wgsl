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

// A child mask's coverage applied to its group's, at the child's opacity: operation 0 adds, 1
// subtracts, and 2 intersects, keeping the group only where the child covers.
export fn combineCoverage(group: f32, child: f32, operation: u32, opacity: f32) -> f32 {
 if (operation == 2u) {
  return group * (1.0 - opacity * (1.0 - child));
 }
 let sign = select(1.0, -1.0, operation == 1u);
 return clamp(group + sign * opacity * child, 0.0, 1.0);
}

// A gradient modifier applied to the group's coverage at `at`, from its three entries as modifierData
// lays them out: its geometry; opacity, kind, feather, and angle; then its operation.
export fn modifierCoverage(group: f32, at: vec2f, points: vec4f, settings: vec4f, operation: vec4f) -> f32 {
 let child = gradientCoverage(at, points.xy, points.zw, u32(settings.y), settings.z, settings.w);
 return combineCoverage(group, child, u32(operation.x), settings.x);
}
