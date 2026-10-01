import { srgbToLinear3 } from "@vgpu/wgsl-std/color";
import { luminance, rec2020ToSrgb, toOklab } from "../../image/color.wgsl";

// A mask's coverage narrowed by its range: the coverage of its shape, sampled from a raster of any
// resolution, or without one the whole image, times how much the range keeps of the image below.
struct Params {
 // 1 is luminance, with low, high, and smoothness from 0 to 1; 2 is color, with the sRGB color in xyz
 // and tolerance from 0 to 1.
 kind: u32,
 range: vec4f,
 shaped: u32,
}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var shape: texture_2d<f32>;
@group(0) @binding(2) var shapeSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

// CIE lightness of a working color, 0 black to 1 white; headroom above white counts as white.
fn lightness(color: vec3f) -> f32 {
 let y = clamp(luminance(color), 0.0, 1.0);
 return select(y * 9.033, 1.16 * pow(y, 1.0 / 3.0) - 0.16, y > 0.008856);
}

// Hue and saturation of a linear sRGB color, as Oklab chroma over lightness, which exposure leaves unchanged.
fn tint(srgb: vec3f) -> vec2f {
 let lab = toOklab(srgb);
 return lab.yz / max(lab.x, 0.02);
}

fn kept(color: vec3f) -> f32 {
 if (params.kind == 1u) {
  let light = lightness(color);
  let soft = max(params.range.z, 0.0001);
  return smoothstep(params.range.x - soft, params.range.x, light) * (1.0 - smoothstep(params.range.y, params.range.y + soft, light));
 }
 let radius = mix(0.01, 0.25, params.range.w);
 return 1.0 - smoothstep(radius * 0.5, radius, distance(tint(rec2020ToSrgb * color), tint(srgbToLinear3(params.range.xyz))));
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let color = textureLoad(image, vec2i(position.xy), 0).rgb;
 var covered = 1.0;
 if (params.shaped != 0u) {
  let uv = position.xy / vec2f(textureDimensions(image));
  covered = textureSampleLevel(shape, shapeSampler, uv, 0.0).r;
 }
 return vec4f(covered * kept(color), 0.0, 0.0, 1.0);
}
