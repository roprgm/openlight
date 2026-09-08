struct Params {
  origin: vec2u,
  size: vec2u,
  orientation: u32,
  scale: f32,
  black: f32,
  white: f32,
  neutral: vec3f,
  pattern: vec4u,
  matrix: mat3x3f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var mosaic: texture_2d<f32>;

// Sensor value at a stored position, black subtracted and scaled so the white level is 1.0.
fn raw(p: vec2i) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(textureDimensions(mosaic)) - 1);
  return (textureLoad(mosaic, q, 0).r * params.scale - params.black) / (params.white - params.black);
}

fn colorAt(p: vec2i) -> u32 {
  return params.pattern[u32(p.y & 1) * 2u + u32(p.x & 1)];
}

// Where this output pixel sits in the stored mosaic, undoing the orientation tag within the crop.
fn stored(output: vec2u) -> vec2i {
  var p = output;
  let o = params.orientation;
  if o >= 5u { p = p.yx; }
  if o == 2u || o == 3u || o == 7u || o == 8u { p.x = params.size.x - 1u - p.x; }
  if o == 3u || o == 4u || o == 6u || o == 7u { p.y = params.size.y - 1u - p.y; }
  return vec2i(params.origin + p);
}

// Bilinear demosaic: each color is the mean of its samples in the 3×3 neighborhood, which is the
// pixel itself, its four orthogonal or its four diagonal neighbors depending on the pattern.
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = stored(vec2u(position.xy));
  var sum = vec3f(0.0);
  var count = vec3f(0.0);
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let q = p + vec2i(dx, dy);
      let c = colorAt(q);
      sum[c] += raw(q);
      count[c] += 1.0;
    }
  }
  // White balance, then clip: a channel past the sensor's white cannot be trusted.
  let balanced = min(sum / count / params.neutral, vec3f(1.0));
  return vec4f(params.matrix * balanced, 1.0);
}
