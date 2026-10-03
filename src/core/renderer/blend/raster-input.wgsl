// The image a curve receives, with rasterized coverage as alpha, drawn at the histogram's few texels.
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var coverage: texture_2d<f32>;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
 let color = textureSampleLevel(image, imageSampler, uv, 0.0);
 let covered = textureSampleLevel(coverage, imageSampler, uv, 0.0).r;
 return vec4f(color.rgb, color.a * covered);
}
