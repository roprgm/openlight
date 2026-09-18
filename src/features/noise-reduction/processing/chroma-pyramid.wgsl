import { packColor, unpackColor } from "./color.wgsl";
import { luminance } from "../../../core/image/color.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var coarse: texture_2d<f32>;
@group(0) @binding(2) var coarseFiltered: texture_2d<f32>;
@group(0) @binding(3) var<uniform> variance: array<vec4f, 16>;
// x: shrinkage constant, y: compact-feature mix, z: restore working luminance.
@group(0) @binding(4) var<uniform> settings: vec4f;

fn interpolate(image: texture_2d<f32>, p: vec2i) -> vec4f {
  let coordinate = (vec2f(p) + 0.5) * 0.5 - 0.5;
  let base = vec2i(floor(coordinate));
  let fraction = fract(coordinate);
  let last = vec2i(textureDimensions(image)) - 1;
  let a = packColor(textureLoad(image, clamp(base, vec2i(0), last), 0));
  let b = packColor(textureLoad(image, clamp(base + vec2i(1, 0), vec2i(0), last), 0));
  let c = packColor(textureLoad(image, clamp(base + vec2i(0, 1), vec2i(0), last), 0));
  let d = packColor(textureLoad(image, clamp(base + vec2i(1, 1), vec2i(0), last), 0));
  return vec4f(mix(mix(a.rgb, b.rgb, fraction.x), mix(c.rgb, d.rgb, fraction.x), fraction.y), min(min(a.a,b.a),min(c.a,d.a)));
}

struct CoarseEstimate { before: vec2f, after: vec2f, coverage: f32 }
fn estimateCoarse(p: vec2i, guide: vec2f, noise: vec2f) -> CoarseEstimate {
  let coordinate = (vec2f(p) + 0.5) * 0.5 - 0.5;
  let base = vec2i(floor(coordinate));
  let fraction = fract(coordinate);
  let last = vec2i(textureDimensions(coarse)) - 1;
  var before = vec2f(0.0);
  var after = vec2f(0.0);
  var weight = 0.0;
  var coverage = 1.0;
  for (var y = 0; y < 2; y++) {
    for (var x = 0; x < 2; x++) {
      let q = clamp(base + vec2i(x,y), vec2i(0), last);
      let a = packColor(textureLoad(coarse,q,0));
      let b = packColor(textureLoad(coarseFiltered,q,0));
      let delta = a.yz - guide;
      let distance = dot(delta*delta / max(noise*16.0, vec2f(1e-8)),vec2f(1.0));
      let spatial = mix(1.0-fraction,fraction,vec2f(f32(x),f32(y)));
      // A positive normalized weight always transfers the coarse correction, even
      // when a fine-scale outlier disagrees with every coarse sample.
      let w = spatial.x * spatial.y * max(exp(-distance), 1e-4);
      before += a.yz * w;
      after += b.yz * w;
      weight += w;
      coverage = min(coverage,min(a.a,b.a));
    }
  }
  return CoarseEstimate(before/weight,after/weight,coverage);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let original = textureLoad(source, p, 0);
  let before = packColor(original);
  let brightness = clamp(before.x * 0.5773502692, 0.0, 1.0) * 15.0;
  let lower = u32(brightness);
  let noise = mix(variance[lower], variance[min(lower + 1u, 15u)], fract(brightness)).yz;
  let coarseEstimate = estimateCoarse(p, before.yz, noise);
  if min(original.a, coarseEstimate.coverage) < 1.0 { return original; }
  let detail = before.yz - coarseEstimate.before;
  var energy = vec2f(0.0);
  // Neighborhood energy distinguishes coherent color structure from isolated noise.
  // Shrink only this band: fine-scale detail never vetoes coarse color correction.
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = clamp(p + vec2i(x,y), vec2i(0), vec2i(textureDimensions(source))-1);
      let coeff = packColor(textureLoad(source,q,0)).yz - interpolate(coarse,q).yz;
      energy += coeff * coeff / 9.0;
    }
  }
  // Compact lights occupy less than the 3×3 window. Coarse bands skip this
  // term: a chroma blotch looks like an isolated coefficient at those scales.
  let centerBand = before.yz - interpolate(coarse, p).yz;
  energy = max(energy, centerBand * centerBand * 0.5 * settings.y);
  let signal = max(dot(energy / max(noise, vec2f(1e-10)), vec2f(1.0)) - 2.0, 0.0);
  // Smooth firm shrinkage removes weak coefficients without repeatedly
  // attenuating high-SNR color features across the pyramid.
  let gain = signal * signal / (signal * signal + max(settings.x, 1.0));
  let after = vec3f(before.x, coarseEstimate.after + gain * detail);
  // Keep intermediate bands in perceptual color. Repeated linear-luminance
  // corrections feed chroma shifts back into the next reconstruction level.
  if settings.z < 0.5 { return vec4f(unpackColor(after), original.a); }
  let reconstructed = unpackColor(after);
  let sourceLuminance = luminance(original.rgb);
  let reconstructedLuminance = luminance(reconstructed);
  // A common gain preserves hue; adding gray can create negative channels
  // that the display gamut mapping then desaturates. Keep signed dark values.
  if sourceLuminance > 0.0 && reconstructedLuminance > 1e-10 {
    return vec4f(reconstructed * (sourceLuminance / reconstructedLuminance), original.a);
  }
  let correction = reconstructed - unpackColor(before.rgb);
  return vec4f(original.rgb + correction - vec3f(luminance(correction)), original.a);
}
