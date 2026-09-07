import { linearToSrgb, srgbToLinear } from "@vgpu/wgsl-std/color";
import { luminance } from "../color.wgsl";

struct Params { mode: u32, reduction: i32, amount: f32, sigma: f32 }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

fn load(p: vec2i) -> vec4f {
  return textureLoad(source, clamp(p, vec2i(0), vec2i(textureDimensions(source)) - 1), 0);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  if (params.mode == 0u) {
    var total = vec2f(0.0);
    for (var y = 0; y < params.reduction; y++) {
      for (var x = 0; x < params.reduction; x++) {
        let pixel = load(p * params.reduction + vec2i(x, y));
        total += vec2f(linearToSrgb(max(luminance(pixel.rgb), 0.0)), 1.0) * pixel.a;
      }
    }
    return vec4f(total / f32(params.reduction * params.reduction), 0.0, 1.0);
  }
  if (params.mode < 3u) {
    let sigma = params.sigma;
    let axis = select(vec2i(0, 1), vec2i(1, 0), params.mode == 1u);
    var total = vec2f(0.0);
    var weights = 0.0;
    let radius = i32(ceil(3.0 * sigma));
    for (var offset = -radius; offset <= radius; offset++) {
      let distance = f32(offset) / sigma;
      let weight = exp(-0.5 * distance * distance);
      let pixel = load(p + axis * offset);
      var value = pixel.rg;
      if (params.mode == 1u && params.reduction == 1) {
        value = vec2f(linearToSrgb(max(luminance(pixel.rgb), 0.0)), 1.0) * pixel.a;
      }
      total += value * weight;
      weights += weight;
    }
    return vec4f(total / weights, 0.0, 1.0);
  }
  let pixel = load(p);
  if (pixel.a == 0.0) { return pixel; }
  let y = max(luminance(pixel.rgb), 0.0);
  let lightness = linearToSrgb(y);
  let uv = position.xy / (f32(params.reduction) * vec2f(textureDimensions(base)));
  let blurred = textureSampleLevel(base, linearSampler, uv, 0.0).rg;
  let mean = blurred.r / max(blurred.g, 0.000001);
  let outputY = srgbToLinear(max(lightness + params.amount * (lightness - mean), 0.0));
  let rgb = select(vec3f(outputY), pixel.rgb * (outputY / max(y, 0.000001)), y > 0.000001);
  return vec4f(rgb, pixel.a);
}
