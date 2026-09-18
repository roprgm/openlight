import { packColor } from "./color.wgsl";

export fn transferChroma(source: texture_2d<f32>, coarse: texture_2d<f32>, coarseFiltered: texture_2d<f32>, p: vec2i, variance: array<vec4f, 16>, chromaOnly: bool) -> vec4f {
  let original = packColor(textureLoad(source, p, 0));
  if all(textureDimensions(source) == textureDimensions(coarse)) { return original; }
  // Transfer only the coarse chroma correction. Full-resolution luminance and
  // high-frequency color detail remain available to the collaborative filter.
  let coordinate = (vec2f(p) + 0.5) * 0.5 - 0.5;
  let base = vec2i(floor(coordinate));
  let fraction = fract(coordinate);
  let brightness = clamp(original.x * 0.5773502692, 0.0, 1.0) * 15.0;
  let lower = u32(brightness);
  // Match the collaborative filter's continuous model; bin boundaries are not image edges.
  let noise = mix(variance[lower], variance[min(lower + 1u, 15u)], fract(brightness)).xyz;
  var correction = vec2f(0.0);
  var weight = 0.0;
  for (var y = 0; y < 2; y++) {
    for (var x = 0; x < 2; x++) {
      let q = clamp(base + vec2i(x, y), vec2i(0), vec2i(textureDimensions(coarse)) - 1);
      let before = packColor(textureLoad(coarse, q, 0));
      let after = packColor(textureLoad(coarseFiltered, q, 0));
      let distance = (before.xyz - original.xyz) * (before.xyz - original.xyz);
      let spatial = mix(1.0 - fraction, fraction, vec2f(f32(x), f32(y)));
      let normalized = distance / max(noise * 16.0, vec3f(1e-6));
      // A color-only correction can cross luminance texture without blurring it.
      let range = select(normalized.x + normalized.y + normalized.z, normalized.y + normalized.z, chromaOnly);
      let w = spatial.x * spatial.y * exp(-range);
      if min(before.a, after.a) >= 1.0 { correction += w * (after.yz - before.yz); weight += w; }
    }
  }
  var neighborhood = vec2f(0.0);
  for (var y = -2; y <= 2; y += 4) {
    for (var x = -2; x <= 2; x += 4) {
      let q = clamp(p + vec2i(x, y), vec2i(0), vec2i(textureDimensions(source)) - 1);
      neighborhood += packColor(textureLoad(source, q, 0)).yz * 0.25;
    }
  }
  // A resolved color feature can match its downsampled input even when the
  // coarse filter erased it. Protect chroma detail that exceeds fine-scale noise.
  let detail = original.yz - neighborhood;
  let contrast = dot(detail * detail / max(noise.yz, vec2f(1e-10)), vec2f(1.0));
  let confidence = 1.0 - smoothstep(16.0, 64.0, contrast);
  // Fade unsupported corrections instead of amplifying tiny interpolation weights.
  return original + vec4f(0.0, confidence * correction / max(weight, 0.25), 0.0);
}
