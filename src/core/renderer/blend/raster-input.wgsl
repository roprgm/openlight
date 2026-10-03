// The image a curve receives, with rasterized coverage as alpha, drawn at the histogram's few texels:
// each reads one image texel, as the histogram counted them at full size, from the texel's own column.
struct Params {
 // Image texels per input texel.
 ratio: vec2f,
}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var coverageSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let read = floor(floor(position.xy) * params.ratio);
 let color = textureLoad(image, vec2i(read), 0);
 let uv = (read + 0.5) / vec2f(textureDimensions(image));
 let covered = textureSampleLevel(coverage, coverageSampler, uv, 0.0).r;
 return vec4f(color.rgb, color.a * covered);
}
