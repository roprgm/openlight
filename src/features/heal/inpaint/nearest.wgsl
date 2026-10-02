struct Params { jump: i32 }
@group(0) @binding(0) var features: texture_2d<f32>;
@group(0) @binding(1) var previous: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  if (params.jump == 0) {
    return select(vec4f(-1.0, -1.0, 1e10, 0.0), vec4f(vec2f(p), 0.0, 1.0), textureLoad(features, p, 0).a > 0.5);
  }
  let end = vec2i(textureDimensions(previous)) - 1;
  var best = textureLoad(previous, p, 0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = p + vec2i(x, y) * params.jump;
      if (any(q < vec2i(0)) || any(q > end)) { continue; }
      var candidate = textureLoad(previous, q, 0);
      let delta = candidate.xy - vec2f(p);
      candidate.z = dot(delta, delta);
      if (candidate.w > 0.5 && (best.w < 0.5 || candidate.z < best.z)) { best = candidate; }
    }
  }
  return best;
}
