import { srgbToRec2020, display } from "../src/lib/color.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> decode: u32;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let pixel = textureLoad(source, vec2i(position.xy), 0);
  if (decode != 0u) {
    return vec4f(srgbToRec2020 * pixel.rgb, pixel.a);
  }
  return vec4f(display(pixel.rgb), pixel.a);
}
