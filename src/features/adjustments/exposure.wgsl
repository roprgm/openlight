import { toWorking } from "../../core/image/color.wgsl";
import { adjustExposure } from "./prepare.wgsl";

struct Params {
 // The primaries the input is in, as toWorking numbers them: the image layer's pass converts an 8-bit source.
 primaries: u32,
 exposure: f32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let pixel = textureLoad(source, vec2i(position.xy), 0);
 let working = toWorking(pixel.rgb, params.primaries);
 return vec4f(adjustExposure(working, params.exposure), pixel.a);
}
