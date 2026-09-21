import { tau } from "@vgpu/wgsl-std/constants";
import { hash2, hash3 } from "@vgpu/wgsl-std/hash";
import { rotate2d } from "@vgpu/wgsl-std/math";
import { simplex3d } from "@vgpu/wgsl-std/noise/simplex";

struct Params {
  pointer: vec2f,
  size: vec2f,
  time: f32,
  pull: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const dark = vec3f(0.075);
const light = vec3f(0.17, 0.163, 0.156);
const mote = vec3f(1.0, 0.94, 0.82);

// One drifting, twinkling mote per grid cell; each pixel checks its 3x3 neighborhood.
fn motes(p: vec2f, t: f32, density: f32, rise: f32) -> f32 {
  let q = p * density + vec2f(0.0, t * rise);
  let cell = floor(q);
  let f = q - cell;
  var sum = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let o = vec2f(f32(x), f32(y));
      let h = hash3(vec3f(cell + o, density));
      let sway = vec2f(sin(t * 0.5 + h.z * tau), cos(t * 0.4 + h.x * tau)) * 0.1;
      let dist = distance(f, o + 0.3 + h.xy * 0.4 + sway);
      let size = 0.03 + h.z * 0.05;
      let twinkle = 0.55 + 0.45 * sin(t * (0.8 + h.y * 1.5) + h.x * tau);
      let dot = 1.0 - smoothstep(0.0, size, dist);
      sum += dot * dot * twinkle;
    }
  }
  return sum;
}

@fragment fn fs_main(
  @location(0) uv: vec2f,
  @builtin(position) pixel: vec4f,
) -> @location(0) vec4f {
  let t = params.time;
  // pull is 0.05 under a hovering mouse and 1 under a dragged file:
  // the mouse only nudges the motes, the file gets the whole effect.
  let pull = params.pull;
  let drag = smoothstep(0.05, 1.0, pull);
  let frame = vec2f(params.size.x / params.size.y, 1.0);
  let p = (uv - 0.5) * frame;
  let pointer = (params.pointer - 0.5) * frame;
  let falloff = 1.0 - smoothstep(0.0, 0.3, distance(p, pointer));
  let near = drag * falloff;

  let drift = vec2f(sin(t * 0.5), cos(t * 0.37)) * 0.08;
  let r = distance(p, mix(drift, pointer, drag * 0.4));
  let wobble = simplex3d(vec3f(p * 1.2, t * 0.3)) * 0.15;
  let radius = (0.55 + 0.12 * drag) * length(frame * 0.5) + 0.04 * sin(t * 0.7);
  let beam = 1.0 - smoothstep(0.0, 1.0, r / radius + wobble);
  let glow = beam + near * 0.4;

  // Magnet: pixels near the pointer sample motes from farther out and rotated,
  // so they crowd and spiral in. Only a dragged file gets the spiral.
  let q = pointer + rotate2d(p - pointer, near * 1.6) * (1.0 + pull * falloff * 1.2);

  // Dust shows where the light is: inside the beam, and around a dragged file.
  let dust = motes(q, t, 7.0, 0.15) + motes(q, t, 12.0, 0.125) * 0.5;
  let lit = 0.15 + 0.6 * beam + near * 0.6;

  // Static per-pixel dither hides banding in the few gray levels the glow spans.
  let dither = (hash2(pixel.xy).x - 0.5) / 255.0;
  let color = mix(dark, light, glow) + mote * dust * lit;
  return vec4f(color + dither, 1.0);
}
