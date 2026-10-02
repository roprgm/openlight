// A texel an earlier field filled keeps its donor while it stays in the hole and its donor stays out of it.
struct Params { origin: vec2f, baseOrigin: vec2f, scale: f32, baseScale: f32 }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var base: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let current = textureLoad(field, p, 0);
  if (textureLoad(source, p, 0).a < 0.5) { return current; }
  let cell = vec2i(floor((params.origin + position.xy * params.scale - params.baseOrigin) / params.baseScale));
  if (any(cell < vec2i(0)) || any(cell >= vec2i(textureDimensions(base)))) { return current; }
  let offset = textureLoad(base, cell, 0).xy;
  if (all(offset == vec2f(0.0))) { return current; }
  let donor = p + vec2i(round(offset * params.baseScale / params.scale));
  let end = vec2i(textureDimensions(source)) - 1;
  if (any(donor < vec2i(0)) || any(donor > end) || textureLoad(source, donor, 0).a > 0.5) { return current; }
  // A negative cost pins the texel for the passes after this one.
  return vec4f(vec2f(donor - p), -1.0, 1.0);
}
