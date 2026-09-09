struct View { size: vec2f, imageSize: vec2f, pan: vec2f, scale: f32, time: f32 }
@group(0) @binding(0) var mask: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> view: View;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = ((uv - 0.5) * view.size - view.pan) / (view.imageSize * view.scale) + 0.5;
  if (any(p < vec2f(0.0)) || any(p > vec2f(1.0))) { return vec4f(0.0); }
  let value = textureSampleLevel(mask, linearSampler, p, 0.0).r;
  let step = 1.0 / (view.imageSize * view.scale);
  let dx = textureSampleLevel(mask, linearSampler, p + vec2f(step.x, 0.0), 0.0).r;
  let dy = textureSampleLevel(mask, linearSampler, p + vec2f(0.0, step.y), 0.0).r;
  let border = (value >= 0.5) != (dx >= 0.5) || (value >= 0.5) != (dy >= 0.5);
  let ant = select(0.05, 1.0, fract((uv.x * view.size.x + uv.y * view.size.y) / 10.0 - view.time) < 0.5);
  if (border) { return vec4f(vec3f(ant), 0.95); }
  return vec4f(0.25, 0.65, 1.0, value * 0.23);
}
