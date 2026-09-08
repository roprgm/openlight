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
 * Luminance-preserving gamut clip: a color the target cannot show slides toward the gray of its own
 * luminance until it fits, so brightness and hue hold and only saturation is lost. This is the
 * simplest member of the family the ACES gamut compressor belongs to; darktable and Krita offer the
 * same clip as their "preserve luminance" mode.
 */
fn clipToGamut(rgb: vec3f, light: f32) -> vec3f {
  var color = rgb;
  let low = min(color.r, min(color.g, color.b));
  if (low < 0.0 && light > 0.0) {
    color = mix(color, vec3f(light), -low / (light - low));
  }
  let high = max(color.r, max(color.g, color.b));
  if (high > 1.0) {
    color = mix(color, vec3f(light), (high - 1.0) / (high - light));
  }
  return clamp(color, vec3f(0.0), vec3f(1.0));
}

/** Working space to what the screen shows: sRGB, clipped to its gamut with hue and luminance kept, encoded. */
export fn display(working: vec3f) -> vec3f {
  let light = luminance(working);
  if (light >= 1.0) {
    return vec3f(1.0);
  }
  return linearToSrgb3(clipToGamut(rec2020ToSrgb * working, light));
}
