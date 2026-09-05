struct Params {
  rect: vec4f,
  size: vec2f,
  rotation: u32,
  cosine: f32,
  sine: f32,
  scale: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let position = (params.rect.xy + uv * params.rect.zw - 0.5) * params.size / params.scale;
  // Inverse rotation maps output pixels back into the unmodified source.
  var p = vec2f(params.cosine * position.x + params.sine * position.y,
                -params.sine * position.x + params.cosine * position.y) / params.size + 0.5;
  switch params.rotation {
    case 1u: { p = vec2f(p.y, 1.0 - p.x); }
    case 2u: { p = 1.0 - p; }
    case 3u: { p = vec2f(1.0 - p.y, p.x); }
    default: {}
  }
  return textureSampleLevel(source, sourceSampler, p, 0.0);
}
