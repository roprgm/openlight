import { linearToSrgb, srgbToLinear } from "@vgpu/wgsl-std/color";
import { luminance } from "../color.wgsl";
import { endpointCurve, remapLuminance } from "./endpoint.wgsl";

// Shift the endpoint by up to 0.1 in perceptual space; amount is -100..100.
export fn adjustBlacks(color: vec3f, amount: f32) -> vec3f {
  if amount == 0.0 {
    return color;
  }
  let light = linearToSrgb(luminance(color));
  if light >= 0.5 {
    return color;
  }
  let mapped = endpointCurve(light, amount / 100.0 * 0.1);
  return remapLuminance(color, srgbToLinear(mapped));
}
