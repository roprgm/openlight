export fn patchCoverage(
  texture: texture_2d<f32>,
  textureSampler: sampler,
  p: vec2f,
  dimensions: vec2f,
  radius: f32,
) -> f32 {
  let uv = p / dimensions;
  let center = textureSampleLevel(texture, textureSampler, uv, 0.0).r;
  if (radius < 0.5) {
    return center;
  }
  let directions = array(
    vec2f(1.0, 0.0), vec2f(-1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, -1.0),
    vec2f(0.707, 0.707), vec2f(-0.707, 0.707), vec2f(0.707, -0.707), vec2f(-0.707, -0.707),
  );
  var total = center * 4.0;
  for (var i = 0u; i < 8u; i++) {
    let direction = directions[i] * radius / dimensions;
    total += textureSampleLevel(texture, textureSampler, uv + direction * 0.35, 0.0).r * 2.0;
    total += textureSampleLevel(texture, textureSampler, uv + direction * 0.85, 0.0).r;
  }
  return total / 28.0;
}
