struct Adjustments {
  exposure: f32,
  temp: f32,
  tint: f32,
  contrast: f32,
  vibrance: f32,
  saturation: f32,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> adjustments: Adjustments;

// All adjustment functions accept and return linear Rec.2020.
fn adjustExposure(color: vec3f, stops: f32) -> vec3f {
  let bounded = clamp(color, vec3f(0.0), vec3f(1.0));
  if stops < 0.0 {
    return exp2(stops * 1.09) * pow(bounded, vec3f(exp2(-stops * 0.14)));
  }
  let gain = mix(vec2f(1.11, -0.11) * min(stops, 1.0), vec2f(4.05, -0.63), max(stops - 1.0, 0.0) / 4.0);
  return 1.0 - pow(1.0 - pow(bounded, vec3f(exp2(gain.y))), vec3f(exp2(gain.x)));
}

fn interpolateGain(amount: f32, half: vec3f, full: vec3f) -> vec3f {
  let strength = 2.0 * abs(amount);
  return mix(half * min(strength, 1.0), full, max(strength - 1.0, 0.0));
}

fn adjustWhiteBalance(color: vec3f, temperature: f32, tint: f32) -> vec3f {
  let warmth = vec3f(2.50, 1.19, -1.89) * temperature
    + (vec3f(1.55, 1.89, 2.93) + vec3f(-1.47, -1.05, -0.69) * temperature) * abs(temperature);
  let tintGain = (vec3f(0.53, -0.59, 1.02) + vec3f(0.64, 0.94, 1.35) * tint) * tint;
  let gain = warmth + tintGain;
  let bounded = min(color, vec3f(1.0));
  return bounded / (bounded + (1.0 - bounded) * exp2(-gain)) + (color - bounded);
}

fn adjustContrast(color: vec3f, amount: f32) -> vec3f {
  let positive = interpolateGain(amount - 1.0, vec3f(0.32, 1.48, 0.0), vec3f(0.59, 2.77, 0.0)).xy;
  let gain = select(positive, vec2f(-0.43, -2.51) * (1.0 - amount), amount < 1.0);
  let bounded = min(color, vec3f(1.0));
  return color + bounded * (1.0 - bounded) * (gain.x + gain.y * (bounded - 0.5));
}

fn adjustSaturation(color: vec3f, amount: f32) -> vec3f {
  let luminance = dot(color, vec3f(0.2627, 0.6780, 0.0593));
  return vec3f(luminance) + (color - vec3f(luminance)) * amount;
}

fn adjustVibrance(color: vec3f, amount: f32) -> vec3f {
  let high = max(max(color.r, color.g), color.b);
  let low = max(0.0, min(min(color.r, color.g), color.b));
  let saturation = 1.0 - sqrt(low / max(high, 0.000001));
  let scale = 1.0 + amount * select(0.63, 0.23, amount < 0.0) * (1.0 - sign(amount) * saturation);
  return max(vec3f(high) + (color - vec3f(high)) * scale, vec3f(0.0));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let input = textureSample(source, sourceSampler, uv);
  var color = input.rgb;
  color = adjustExposure(color, adjustments.exposure);
  color = adjustWhiteBalance(color, adjustments.temp / 100.0, adjustments.tint / 100.0);
  color = adjustContrast(color, 1.0 + adjustments.contrast / 100.0);
  color = adjustVibrance(color, adjustments.vibrance / 100.0);
  color = adjustSaturation(color, 1.0 + adjustments.saturation / 100.0);
  return vec4f(color, input.a);
}
