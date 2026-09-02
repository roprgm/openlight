import { linearToSrgb3 } from "@vgpu/wgsl-std/color";

// The working space is linear Rec.2020; these convert its primaries to and from linear sRGB (column-major).
export const srgbToRec2020 = mat3x3f(
  0.6274, 0.0691, 0.0164,
  0.3293, 0.9195, 0.0880,
  0.0433, 0.0114, 0.8956,
);

export const rec2020ToSrgb = mat3x3f(
  1.6605, -0.1246, -0.0182,
  -0.5876, 1.1329, -0.1006,
  -0.0728, -0.0083, 1.1187,
);

/** Working space to what the screen shows: sRGB, clipped to its gamut, encoded. */
export fn display(working: vec3f) -> vec3f {
  return linearToSrgb3(clamp(rec2020ToSrgb * working, vec3f(0.0), vec3f(1.0)));
}
