import { linearToSrgb3, srgbToLinear3 } from "@vgpu/wgsl-std/color";
import { blendColors } from "../../core/image/blend.wgsl";
import { srgbToRec2020 } from "../../core/image/color.wgsl";

// Lays premultiplied sRGB paint over the image with a Photoshop blend, mixing by the paint's alpha on
// encoded values as Photoshop does. Unpainted pixels pass through, and so does HDR headroom under thin
// paint. The raster covers the source, sampled by position so any proxy resolution reads the same paint.
struct Params {
  blend: u32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var paint: texture_2d<f32>;
@group(0) @binding(2) var paintSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  let uv = position.xy / vec2f(textureDimensions(source));
  let painted = textureSampleLevel(paint, paintSampler, uv, 0.0);
  if (painted.a <= 0.0) {
    return input;
  }
  let color = linearToSrgb3(clamp(srgbToRec2020 * srgbToLinear3(painted.rgb / painted.a), vec3f(0.0), vec3f(1.0)));
  let base = linearToSrgb3(max(input.rgb, vec3f(0.0)));
  let blended = clamp(blendColors(min(base, vec3f(1.0)), color, params.blend), vec3f(0.0), vec3f(1.0));
  return vec4f(srgbToLinear3(mix(base, blended, painted.a)), input.a);
}
