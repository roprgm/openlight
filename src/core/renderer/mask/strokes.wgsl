// Accumulates a chunk of dabs like successive layers of paint: each dab covers its share of what is left.
// The pass blends the result into the mask, so chunks and strokes compose exactly.
struct Params {
  count: u32,
  feather: f32,
}
@group(0) @binding(0) var<storage, read> dabs: array<vec4f>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var remaining = 1.0;
  for (var i = 0u; i < params.count; i++) {
    let dab = dabs[i];
    let radius = max(dab.z, 0.5);
    // At least a half-pixel transition keeps hard brushes from aliasing.
    let inner = min(radius * (1.0 - params.feather), radius - 0.5);
    let weight = 1.0 - smoothstep(inner, radius, length(position.xy - dab.xy));
    remaining *= 1.0 - dab.w * weight;
  }
  return vec4f(1.0 - remaining, 0.0, 0.0, 1.0);
}
