import { luminance } from "../color.wgsl";
import { Adjustments } from "./prepare.wgsl";

// Center hues in degrees mirror `mixerChannels` in mixer.ts.
const centers = array<f32, 8>(0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0);

fn hueDelta(a: f32, b: f32) -> f32 {
  return a - b - 360.0 * round((a - b) / 360.0);
}

// Triangular reach to the neighboring centers covers the wheel; smoothstep softens the shoulders.
fn weight(hue: f32, channel: u32) -> f32 {
  let center = centers[channel];
  let distance = abs(hueDelta(hue, center));
  let reach = select(
    hueDelta(centers[(channel + 1u) % 8u], center),
    hueDelta(center, centers[(channel + 7u) % 8u]),
    hueDelta(hue, center) < 0.0,
  );
  return 1.0 - smoothstep(0.0, reach, distance);
}

fn hueOf(color: vec3f) -> f32 {
  let high = max(color.r, max(color.g, color.b));
  let low = min(color.r, min(color.g, color.b));
  let span = high - low;
  var hue = (color.g - color.b) / span;
  if high == color.g {
    hue = 2.0 + (color.b - color.r) / span;
  } else if high == color.b {
    hue = 4.0 + (color.r - color.g) / span;
  }
  hue *= 60.0;
  return select(hue + 360.0, hue, hue >= 0.0);
}

// Rotation around the gray axis shifts hue at fixed luminance.
fn rotateHue(color: vec3f, degrees: f32) -> vec3f {
  let axis = vec3f(0.57735027);
  let angle = radians(degrees);
  return color * cos(angle) + cross(axis, color) * sin(angle)
    + axis * dot(axis, color) * (1.0 - cos(angle));
}

export fn adjustMixer(input: vec3f, adjustments: Adjustments) -> vec3f {
  let high = max(input.r, max(input.g, input.b));
  let span = high - min(input.r, min(input.g, input.b));
  if high <= 0.0 || span <= 0.0 {
    return input;
  }
  let hue = hueOf(input);
  var delta = vec3f(0.0);
  var total = 0.0;
  for (var channel = 0u; channel < 8u; channel++) {
    let gain = weight(hue, channel);
    delta += gain * adjustments.mixer[channel];
    total += gain;
  }
  // Near-neutral colors keep only a share of the shift, so grays stay put.
  delta *= span / high / total / 100.0;
  var color = rotateHue(input, delta.x * 60.0);
  let gray = vec3f(luminance(color));
  color = gray + (color - gray) * max(1.0 + delta.y, 0.0);
  return color * max(1.0 + delta.z, 0.0);
}
