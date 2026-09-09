struct Params { size: vec2f, tolerance: f32, feather: f32, operation: u32 }
@group(0) @binding(0) var costs: texture_2d<f32>;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

fn selected(p: vec2i) -> f32 {
  let size = vec2i(textureDimensions(costs));
  if (any(p < vec2i(0)) || any(p >= size)) { return 0.0; }
  return select(0.0, 1.0, textureLoad(costs, p, 0).r < params.tolerance);
}
fn bilinear(uv: vec2f) -> f32 {
  let p = uv * vec2f(textureDimensions(costs)) - 0.5;
  let i = vec2i(floor(p));
  let f = fract(p);
  return mix(mix(selected(i), selected(i + vec2i(1, 0)), f.x),
    mix(selected(i + vec2i(0, 1)), selected(i + vec2i(1, 1)), f.x), f.y);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let center = bilinear(uv);
  // Only border neighborhoods change; uniform interiors remain exactly zero or one.
  let step = max(vec2f(0.35) / vec2f(textureDimensions(costs)), vec2f(params.feather * 0.5) / params.size);
  var low = center;
  var high = center;
  var total = 0.0;
  var weights = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let value = bilinear(uv + vec2f(f32(x), f32(y)) * step);
      let weight = exp(-0.5 * f32(x * x + y * y));
      low = min(low, value);
      high = max(high, value);
      total += value * weight;
      weights += weight;
    }
  }
  var mask = select(center, total / weights, high > low);
  let previous = textureSampleLevel(base, linearSampler, uv, 0.0).r;
  switch params.operation {
    case 1u: { mask = max(previous, mask); }
    case 2u: { mask = previous * (1.0 - mask); }
    case 3u: { mask = min(previous, mask); }
    default: {}
  }
  return vec4f(mask, 0.0, 0.0, 1.0);
}
