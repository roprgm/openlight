import { srgbToRec2020 } from "../color.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let texel = textureLoad(source, vec2i(position.xy), 0);
  return vec4f(srgbToRec2020 * texel.rgb, texel.a);
}
