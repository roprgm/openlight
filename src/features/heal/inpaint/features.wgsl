struct Params { coarse: u32 }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var fine: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
fn sampleSource(p: vec2i) -> vec4f {
  return textureLoad(source, clamp(p, vec2i(0), vec2i(textureDimensions(source)) - 1), 0);
}
fn light(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2627, 0.6780, 0.0593));
}
// Texture descriptors survive coarse color averaging; alpha marks wholly clean donor patches.
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy);
  let end = vec2i(textureDimensions(source)) - 1;
  var eligible = 1.0;
  for (var y = -3; y <= 3; y++) {
    for (var x = -3; x <= 3; x++) {
      let q = p + vec2i(x, y);
      if (any(q < vec2i(0)) || any(q > end)) { eligible = 0.0; }
      eligible *= 1.0 - textureLoad(source, clamp(q, vec2i(0), end), 0).a;
    }
  }
  if (params.coarse != 0u) {
    let endFine = vec2i(textureDimensions(fine)) - 1;
    let energy = (textureLoad(fine, min(p * 2, endFine), 0).rg + textureLoad(fine, min(p * 2 + vec2i(1, 0), endFine), 0).rg + textureLoad(fine, min(p * 2 + vec2i(0, 1), endFine), 0).rg + textureLoad(fine, min(p * 2 + vec2i(1, 1), endFine), 0).rg) * 0.25;
    return vec4f(energy, textureLoad(source, p, 0).a, eligible);
  }
  var energy = vec2f(0.0);
  var count = vec2f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = p + vec2i(x, y);
      let center = sampleSource(q);
      let horizontal = sampleSource(q + vec2i(1, 0));
      let vertical = sampleSource(q + vec2i(0, 1));
      let valid = (1.0 - center.a) * (vec2f(1.0) - vec2f(horizontal.a, vertical.a));
      energy += abs(vec2f(light(horizontal.rgb), light(vertical.rgb)) - light(center.rgb)) * valid;
      count += valid;
    }
  }
  return vec4f(energy / max(count, vec2f(1.0)), textureLoad(source, p, 0).a, eligible);
}
