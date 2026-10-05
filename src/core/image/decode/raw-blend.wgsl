// Writes sensor samples for the package to develop: the decoded ones blended toward replacement
// samples, each 2 × 2 cell's four by position above black in one texel, and dithered so smooth
// replacements don't band when rounded back to whole sensor units.
struct Blend {
  amount: f32,
  // Each 2 × 2 position's black level.
  black: vec4f,
}

@group(0) @binding(0) var decoded: texture_2d<u32>;
@group(0) @binding(1) var replacement: texture_2d<f32>;
@group(0) @binding(2) var<uniform> blend: Blend;

// One triangle covering the whole destination.
@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let points = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(points[index], 0, 1);
}

// Uniform in [-0.5, 0.5), from a hash of the sample's position (PCG, Jarzynski and Olano, 2020).
fn dither(p: vec2u) -> f32 {
  var state = p.x * 747796405u + p.y * 2891336453u + 2891336453u;
  state = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return f32((state >> 22u) ^ state) / 4294967296.0 - 0.5;
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4u {
  let p = vec2u(position.xy);
  let original = f32(textureLoad(decoded, p, 0).r);
  let cell = p / 2u;
  // A last odd row or column has no cell and keeps its samples.
  if (any(cell >= textureDimensions(replacement))) {
    return vec4u(u32(original));
  }
  let site = (p.y & 1u) * 2u + (p.x & 1u);
  let value = textureLoad(replacement, cell, 0)[site] + blend.black[site];
  let blended = mix(original, value, blend.amount) + dither(p);
  return vec4u(u32(clamp(round(blended), 0.0, 65535.0)));
}
