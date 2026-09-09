@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sky = vec3f(0.125 + 0.091 * uv.x);
  let shirt = vec3f(0.6, 0.05, 0.1);
  return vec4f(select(sky, shirt, uv.x >= 0.5), 1.0);
}
