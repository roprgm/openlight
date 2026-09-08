import { linearToSrgb3 } from "@vgpu/wgsl-std/color";

export fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2627, 0.6780, 0.0593));
}

// The working space is linear Rec.2020; these convert its primaries to and from linear sRGB and Display P3 (column-major).
export const srgbToRec2020 = mat3x3f(
  0.6274, 0.0691, 0.0164,
  0.3293, 0.9195, 0.0880,
  0.0433, 0.0114, 0.8956,
);

export const p3ToRec2020 = mat3x3f(
  0.7538, 0.0457, -0.0012,
  0.1986, 0.9418, 0.0176,
  0.0476, 0.0125, 0.9836,
);

export const rec2020ToSrgb = mat3x3f(
  1.6605, -0.1246, -0.0182,
  -0.5876, 1.1329, -0.1006,
  -0.0728, -0.0083, 1.1187,
);

/**
 * Working space to what the screen shows: sRGB, brought into its gamut, encoded. Colors the screen
 * cannot show slide toward their own luminance until they fit, so bright saturated light rolls off to
 * white and hue holds, instead of each channel clipping on its own into cyan, magenta, or yellow.
 */
export fn display(working: vec3f) -> vec3f {
  let light = luminance(working);
  if (light >= 1.0) {
    return vec3f(1.0);
  }
  var rgb = rec2020ToSrgb * working;
  let low = min(rgb.r, min(rgb.g, rgb.b));
  if (low < 0.0 && light > 0.0) {
    rgb = mix(rgb, vec3f(light), -low / (light - low));
  }
  let high = max(rgb.r, max(rgb.g, rgb.b));
  if (high > 1.0) {
    rgb = mix(rgb, vec3f(light), (high - 1.0) / (high - light));
  }
  return linearToSrgb3(clamp(rgb, vec3f(0.0), vec3f(1.0)));
}
