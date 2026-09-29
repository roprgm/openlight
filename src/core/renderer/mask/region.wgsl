// A raster covers part of the source, starting at `origin` in source pixels; nothing lies outside it.
export fn sampleRegion(raster: texture_2d<f32>, rasterSampler: sampler, point: vec2f, origin: vec2f) -> vec4f {
  let uv = (point - origin) / vec2f(textureDimensions(raster));
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
    return vec4f(0.0);
  }
  return textureSampleLevel(raster, rasterSampler, uv, 0.0);
}
