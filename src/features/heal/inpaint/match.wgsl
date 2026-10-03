struct Params {
  jump: i32,
  iteration: u32,
  initialize: u32,
  coarse: u32,
  confidence: f32,
  radius: f32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var features: texture_2d<f32>;
@group(0) @binding(2) var current: texture_2d<f32>;
@group(0) @binding(3) var field: texture_2d<f32>;
@group(0) @binding(4) var nearest: texture_2d<f32>;
@group(0) @binding(5) var<uniform> params: Params;

fn random(seed: u32) -> f32 {
  var n = seed;
  n = (n ^ (n >> 16u)) * 0x7feb352du;
  n = (n ^ (n >> 15u)) * 0x846ca68bu;
  n = n ^ (n >> 16u);
  return f32(n & 0x00ffffffu) / 16777216.0;
}
fn descriptor(p: vec2i) -> vec2f {
  let feature = textureLoad(features, p, 0);
  if (feature.z < 0.5 || params.initialize != 0u) { return feature.rg; }
  let q = clamp(p + vec2i(textureLoad(field, p, 0).xy), vec2i(0), vec2i(textureDimensions(features)) - 1);
  return textureLoad(features, q, 0).rg;
}
fn distance(p: vec2i, q: vec2i, limit: f32) -> f32 {
  let end = vec2i(textureDimensions(source)) - 1;
  if (any(q < vec2i(3)) || any(q > end - 3) || textureLoad(features, q, 0).a < 0.5) { return 1e10; }
  var error = 0.0;
  var weight = 0.0;
  for (var y = -3; y <= 3; y += 3) {
    for (var x = -3; x <= 3; x += 3) {
      let a = clamp(p + vec2i(x, y), vec2i(0), end);
      let b = q + vec2i(x, y);
      let masked = textureLoad(source, a, 0).a;
      let correspondence = textureLoad(field, a, 0);
      let pinned = params.initialize == 0u && correspondence.z < 0.0;
      let reconstructed = select(0.0, select(params.confidence, 1.0, pinned), correspondence.w > 0.5);
      let confidence = select(1.0, reconstructed, masked > 0.5);
      let destination = textureLoad(current, a, 0).rgb;
      let donor = textureLoad(source, b, 0).rgb;
      let delta = destination - donor;
      let textureDelta = descriptor(a) - textureLoad(features, b, 0).rg;
      error += confidence * (dot(delta, delta) + 2.0 * dot(textureDelta, textureDelta));
      weight += confidence;
      if (error > limit * 9.0) { return 1e10; }
    }
  }
  // A weak spatial preference resolves flat-region ties without overruling appearance.
  let offset = vec2f(q - p) / vec2f(textureDimensions(source));
  return error / max(weight, 0.001) + 0.0001 * dot(offset, offset);
}
fn consider(p: vec2i, offset: vec2i, best: vec4f) -> vec4f {
  let score = distance(p, p + offset, best.z);
  if (score < best.z) { return vec4f(vec2f(offset), score, 1.0); }
  return best;
}
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let size = vec2i(textureDimensions(source));
  if (textureLoad(features, p, 0).a > 0.5) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  if (params.initialize == 0u) {
    let pinned = textureLoad(field, p, 0);
    if (pinned.z < 0.0) { return pinned; }
  }
  if (textureLoad(source, p, 0).a > 0.5 && sqrt(textureLoad(nearest, p, 0).z) > params.radius) { return vec4f(0.0, 0.0, 1e10, 0.0); }
  var best = vec4f(0.0, 0.0, 1e10, 0.0);
  if (params.initialize != 0u) {
    if (params.coarse != 0u) {
      let scale = vec2f(size) / vec2f(textureDimensions(field));
      let inherited = textureLoad(field, vec2i(vec2f(p) / scale), 0);
      if (inherited.w > 0.5) { best = consider(p, vec2i(round(inherited.xy * scale)), best); }
      // Keep the coarse solution inside the hole instead of resetting it to nearest texture.
      if (best.w > 0.5 && textureLoad(source, p, 0).a > 0.5) { return best; }
    }
  } else {
    best = consider(p, vec2i(textureLoad(field, p, 0).xy), best);
    let directions = array(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
    for (var i = 0u; i < 4u; i++) {
      let neighbor = p + directions[i] * params.jump;
      if (all(neighbor >= vec2i(0)) && all(neighbor < size)) {
        best = consider(p, vec2i(textureLoad(field, neighbor, 0).xy), best);
      }
    }
  }
  if (best.w < 0.5) {
    let closest = textureLoad(nearest, p, 0);
    if (closest.w > 0.5) { best = consider(p, vec2i(closest.xy) - p, best); }
  }
  let seed = u32(p.x) * 1973u + u32(p.y) * 9277u + params.iteration * 26699u;
  var radius = f32(max(size.x, size.y));
  for (var i = 0u; i < 8u; i++) {
    let noise = vec2f(random(seed + i * 101u), random(seed + i * 101u + 37u)) * 2.0 - 1.0;
    let center = select(vec2f(p) + best.xy, vec2f(size) * 0.5, params.initialize != 0u || best.w < 0.5);
    let candidate = vec2i(round(center + noise * radius));
    best = consider(p, candidate - p, best);
    radius *= 0.5;
  }
  return best;
}
