import { luminance } from "../color.wgsl";

// In perceptual 0..1: move the black endpoint horizontally or vertically,
// joining the identity at 0.5 with slope 1. Whites use the mirrored curve.
export fn endpointCurve(value: f32, offset: f32) -> f32 {
  let start = max(-offset, 0.0);
  let t = clamp((value - start) / (0.5 - start), 0.0, 1.0);
  return max(value, start) + offset * (1.0 - t) * (1.0 - t) * (1.0 + 2.0 * t);
}

// Move towards neutral white when brightening and neutral black when darkening.
// This also handles a lifted pure black or a clipped colored highlight.
export fn remapLuminance(color: vec3f, mapped: f32) -> vec3f {
  let light = luminance(color);
  if mapped > light {
    return mix(color, vec3f(1.0), (mapped - light) / (1.0 - light));
  }
  if mapped < light {
    return color * (mapped / light);
  }
  return color;
}
