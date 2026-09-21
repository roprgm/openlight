import { linearToSrgb3, srgbToLinear3 } from "@vgpu/wgsl-std/color";
import { srgbToRec2020 } from "../../core/image/color.wgsl";

// Photoshop's blend formulas on encoded values: the working RGB and the sRGB color both take the
// sRGB transfer first, so Multiply, Overlay and the rest look as they do in Photoshop. HDR input
// is clamped where the fill applies.
struct Params {
  color: vec3f,
  blend: u32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn lum(color: vec3f) -> f32 {
  return dot(color, vec3f(0.3, 0.59, 0.11));
}

fn clipColor(color: vec3f) -> vec3f {
  let l = lum(color);
  let low = min(color.r, min(color.g, color.b));
  let high = max(color.r, max(color.g, color.b));
  var result = color;
  if (low < 0.0) {
    result = l + (result - l) * l / (l - low);
  }
  if (high > 1.0) {
    result = l + (result - l) * (1.0 - l) / (high - l);
  }
  return result;
}

fn setLum(color: vec3f, l: f32) -> vec3f {
  return clipColor(color + (l - lum(color)));
}

fn softLight(base: vec3f, blend: vec3f) -> vec3f {
  let d = select(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, base <= vec3f(0.25));
  return select(
    base + (2.0 * blend - 1.0) * (d - base),
    base - (1.0 - 2.0 * blend) * base * (1.0 - base),
    blend <= vec3f(0.5),
  );
}

fn blend(base: vec3f, blend: vec3f) -> vec3f {
  switch (params.blend) {
    case 1u: { return base * blend; }
    case 2u: { return base + blend - base * blend; }
    case 3u: {
      return select(1.0 - 2.0 * (1.0 - base) * (1.0 - blend), 2.0 * base * blend, base <= vec3f(0.5));
    }
    case 4u: { return softLight(base, blend); }
    case 5u: { return setLum(blend, lum(base)); }
    case 6u: { return setLum(base, lum(blend)); }
    default: { return blend; }
  }
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  let base = linearToSrgb3(clamp(input.rgb, vec3f(0.0), vec3f(1.0)));
  let paint = linearToSrgb3(clamp(srgbToRec2020 * srgbToLinear3(params.color), vec3f(0.0), vec3f(1.0)));
  return vec4f(srgbToLinear3(clamp(blend(base, paint), vec3f(0.0), vec3f(1.0))), input.a);
}
