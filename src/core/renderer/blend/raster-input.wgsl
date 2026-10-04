// The image a curve receives, with rasterized coverage as alpha, drawn on the histogram's grid: each
// texel reads the image texel the histogram would read there at full size.
struct Params {
 grid: vec2u,
}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var coverageSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let read = vec2u(position.xy) * textureDimensions(image) / params.grid;
 let color = textureLoad(image, read, 0);
 let uv = (vec2f(read) + 0.5) / vec2f(textureDimensions(image));
 let covered = textureSampleLevel(coverage, coverageSampler, uv, 0.0).r;
 return vec4f(color.rgb, color.a * covered);
}
