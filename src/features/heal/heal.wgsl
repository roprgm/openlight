import { patchCoverage } from "./coverage.wgsl";

struct Params {
  origin: vec2f,
  extent: vec2f,
  dimensions: vec2f,
  offset: vec2f,
  grid: vec2f,
  mode: u32,
  feather: f32,
  opacity: f32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var previous: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<uniform> params: Params;

fn color(p: vec2f) -> vec4f {
  return textureSampleLevel(source, linearSampler, p / params.dimensions, 0.0);
}
fn mask(p: vec2f) -> f32 {
  return textureSampleLevel(coverage, linearSampler, p / params.dimensions, 0.0).r;
}
fn difference(p: vec2f) -> vec3f {
  // A smooth log gain matches color without subtracting bright-boundary differences
  // from dark donor texture, which would clip it into black islands.
  return log(max(color(p).rgb, vec3f(0.0)) + 0.0001) - log(max(color(p + params.offset).rgb, vec3f(0.0)) + 0.0001);
}
fn correction(uv: vec2f) -> vec3f {
  let p = params.origin + uv * params.extent;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || mask(p) < 0.001) {
    return difference(p);
  }
  return textureSampleLevel(previous, linearSampler, uv, 0.0).rgb;
}
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / params.grid;
  if (params.mode == 3u) {
    let p = uv * params.dimensions;
    let original = color(p);
    if (any(p < params.origin) || any(p > params.origin + params.extent)) {
      return original;
    }
    let amount = patchCoverage(coverage, linearSampler, p, params.dimensions, params.feather) * params.opacity;
    let donor = p + params.offset;
    if (amount == 0.0 || any(donor < vec2f(0.5)) || any(donor > params.dimensions - 0.5)) {
      return original;
    }
    let donorColor = max(color(donor).rgb, vec3f(0.0));
    let delta = textureSampleLevel(previous, linearSampler, (p - params.origin) / params.extent, 0.0).rgb;
    // Bound the gain and damp chroma correction so a small dark channel cannot
    // produce the extreme saturation shifts of an unrestricted RGB ratio.
    let luminanceDelta = dot(delta, vec3f(0.2627, 0.6780, 0.0593));
    let safeDelta = clamp(vec3f(luminanceDelta) + (delta - vec3f(luminanceDelta)) * 0.95, vec3f(-0.35), vec3f(0.35));
    let healed = (donorColor + 0.0001) * exp(safeDelta) - 0.0001;
    return vec4f(mix(original.rgb, max(vec3f(0.0), healed), amount), original.a);
  }
  let p = params.origin + uv * params.extent;
  if (mask(p) < 0.001) {
    return vec4f(difference(p), 1.0);
  }
  if (params.mode == 0u) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  if (params.mode == 1u) {
    return vec4f(correction(uv), 1.0);
  }
  let step = 1.0 / params.grid;
  let x = correction(uv + vec2f(step.x, 0.0)) + correction(uv - vec2f(step.x, 0.0));
  let y = correction(uv + vec2f(0.0, step.y)) + correction(uv - vec2f(0.0, step.y));
  // Non-square crops have unequal grid spacing in document pixels.
  let spacing = params.extent / params.grid;
  let weights = 1.0 / (spacing * spacing);
  return vec4f((x * weights.x + y * weights.y) / (2.0 * (weights.x + weights.y)), 1.0);
}
