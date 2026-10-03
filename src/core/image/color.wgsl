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

/** A color in the primaries `primaries` numbers, 0 the working space's, 1 sRGB, 2 Display P3, in the working space. */
export fn toWorking(rgb: vec3f, primaries: u32) -> vec3f {
  switch (primaries) {
    case 1u: { return srgbToRec2020 * rgb; }
    case 2u: { return p3ToRec2020 * rgb; }
    default: { return rgb; }
  }
}

export const rec2020ToSrgb = mat3x3f(
  1.6605, -0.1246, -0.0182,
  -0.5876, 1.1329, -0.1006,
  -0.0728, -0.0083, 1.1187,
);

// Linear sRGB to Oklab, with Bjorn Ottosson's public-domain 2021 matrices:
// https://bottosson.github.io/posts/oklab/
export fn toOklab(rgb: vec3f) -> vec3f {
  let lms = mat3x3f(
    0.4122214708, 0.2119034982, 0.0883024619,
    0.5363325363, 0.6806995451, 0.2817188376,
    0.0514459929, 0.1073969566, 0.6299787005,
  ) * rgb;
  return mat3x3f(
    0.2104542553, 1.9779984951, 0.0259040371,
    0.7936177850, -2.4285922050, 0.7827717662,
    -0.0040720468, 0.4505937099, -0.8086757660,
  ) * (sign(lms) * pow(abs(lms), vec3f(1.0 / 3.0)));
}

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
