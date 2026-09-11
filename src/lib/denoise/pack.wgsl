import { packColor } from "./color.wgsl";
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> origin: vec2i;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = clamp(vec2i(position.xy) + origin, vec2i(0), vec2i(textureDimensions(source)) - 1);
  return packColor(textureLoad(source, p, 0));
}
