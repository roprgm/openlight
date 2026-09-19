import { adjustExposure } from "./prepare.wgsl";
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> exposure: f32;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let pixel = textureLoad(source, vec2i(position.xy), 0);
 return vec4f(adjustExposure(pixel.rgb, exposure), pixel.a);
}
