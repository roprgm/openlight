import { linearToSrgb } from "@vgpu/wgsl-std/color";
import { display, luminance } from "../../image/color.wgsl";
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> point: vec2f;
@fragment fn fs_main() -> @location(0) vec4f {
  let at = clamp(vec2i(point), vec2i(0), vec2i(textureDimensions(source)) - 1);
  let pixel = textureLoad(source, at, 0);
  return vec4f(display(pixel.rgb), linearToSrgb(clamp(luminance(pixel.rgb), 0.0, 1.0)));
}
