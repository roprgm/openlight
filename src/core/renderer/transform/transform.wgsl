export struct Transform {
  origin: vec2f,
  xAxis: vec2f,
  yAxis: vec2f,
}
export fn sourcePoint(transform: Transform, uv: vec2f) -> vec2f {
  return transform.origin + uv.x * transform.xAxis + uv.y * transform.yAxis;
}
