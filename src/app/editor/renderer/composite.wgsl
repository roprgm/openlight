@group(0) @binding(0) var above: texture_2d<f32>;
@group(0) @binding(1) var<uniform> opacity: f32;

// Source-over blending accumulates premultiplied linear RGB in the composite.
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let color = textureLoad(above, vec2i(position.xy), 0);
 let alpha = color.a * opacity;
 return vec4f(color.rgb * alpha, alpha);
}
