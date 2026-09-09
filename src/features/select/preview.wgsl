struct Params {
  seed: vec2u,
  tolerance: f32,
  sampleSize: u32,
  contiguous: u32,
  edgeWeight: f32,
  textureWeight: f32,
}
@group(0) @binding(0) var affinity: texture_2d<f32>;
@group(0) @binding(1) var edges: texture_2d<f32>;
@group(0) @binding(2) var previous: texture_2d<f32>;
@group(0) @binding(3) var next: texture_storage_2d<r32float, write>;
@group(0) @binding(4) var<uniform> params: Params;

fn seedColor() -> vec3f {
  let radius = i32(params.sampleSize / 2u);
  let size = vec2i(textureDimensions(affinity));
  var color = vec3f(0.0);
  for (var y = -radius; y <= radius; y++) {
    for (var x = -radius; x <= radius; x++) {
      color += textureLoad(affinity, clamp(vec2i(params.seed) + vec2i(x, y), vec2i(0), size - 1), 0).rgb;
    }
  }
  return color / f32(params.sampleSize * params.sampleSize);
}

@compute @workgroup_size(8, 8)
fn initialize(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= textureDimensions(affinity))) { return; }
  let p = vec2i(id.xy);
  var cost = 1e20;
  if (params.contiguous == 0u || all(id.xy == params.seed)) {
    cost = distance(textureLoad(affinity, p, 0).rgb, seedColor());
  }
  textureStore(next, p, vec4f(cost));
}

@compute @workgroup_size(8, 8)
fn grow(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2i(textureDimensions(affinity));
  let p = vec2i(id.xy);
  if (any(p >= size)) { return; }
  let a = textureLoad(affinity, p, 0);
  let edge = textureLoad(edges, p, 0).r;
  var cost = textureLoad(previous, p, 0).r;
  let offsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));
  for (var i = 0u; i < 4u; i++) {
    let q = p + offsets[i];
    if (any(q < vec2i(0)) || any(q >= size)) { continue; }
    let before = textureLoad(previous, q, 0).r;
    if (before >= params.tolerance) { continue; }
    let b = textureLoad(affinity, q, 0);
    let weight = distance(a.rgb, b.rgb) + params.edgeWeight * max(edge, textureLoad(edges, q, 0).r)
      + params.textureWeight * abs(a.a - b.a);
    cost = min(cost, before + weight);
  }
  textureStore(next, p, vec4f(cost));
}
