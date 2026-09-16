import { rec2020ToSrgb, srgbToRec2020 } from "../color.wgsl";

fn encode(v: vec3f) -> vec3f {
  let a = abs(v);
  return sign(v) * select(1.055 * pow(a, vec3f(1.0 / 2.4)) - 0.055, 12.92 * a, a <= vec3f(0.0031308));
}
fn decode(v: vec3f) -> vec3f {
  let a = abs(v);
  return sign(v) * select(pow((a + 0.055) / 1.055, vec3f(2.4)), a / 12.92, a <= vec3f(0.04045));
}
// Orthonormal opponent channels: neutral, red-blue and green-magenta.
export fn packColor(working: vec4f) -> vec4f {
  let rgb = encode(rec2020ToSrgb * working.rgb) * working.a;
  return vec4f((rgb.r + rgb.g + rgb.b) * 0.5773502692,
    (rgb.r - rgb.b) * 0.7071067812,
    (rgb.r - 2.0 * rgb.g + rgb.b) * 0.4082482905, working.a);
}
export fn unpackColor(v: vec3f) -> vec3f {
  let neutral = v.x * 0.5773502692;
  let rb = v.y * 0.7071067812;
  let gm = v.z * 0.4082482905;
  return srgbToRec2020 * decode(vec3f(neutral + rb + gm, neutral - 2.0 * gm, neutral - rb + gm));
}
