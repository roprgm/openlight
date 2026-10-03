// Homogeneous: the third components sum to the weight dividing the point, 1 for a frame without perspective.
export struct Transform {
  origin: vec3f,
  xAxis: vec3f,
  yAxis: vec3f,
}
/** Source UV under an output UV; a point past the perspective's horizon lands outside the source. */
export fn sourcePoint(transform: Transform, uv: vec2f) -> vec2f {
  let p = transform.origin + uv.x * transform.xAxis + uv.y * transform.yAxis;
  return select(vec2f(-1.0), p.xy / p.z, p.z > 0.0);
}
