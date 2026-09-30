import { linearToSrgb3, srgbToLinear3 } from "@vgpu/wgsl-std/color";
import { blendColors } from "../../core/image/blend.wgsl";
import { srgbToRec2020 } from "../../core/image/color.wgsl";

// The working RGB and the sRGB color both take the sRGB transfer before blending, as in Photoshop.
// HDR input is clamped where the fill applies.
struct Params {
  color: vec3f,
  blend: u32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  let base = linearToSrgb3(clamp(input.rgb, vec3f(0.0), vec3f(1.0)));
  let paint = linearToSrgb3(clamp(srgbToRec2020 * srgbToLinear3(params.color), vec3f(0.0), vec3f(1.0)));
  return vec4f(srgbToLinear3(clamp(blendColors(base, paint, params.blend), vec3f(0.0), vec3f(1.0))), input.a);
}
