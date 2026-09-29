import { linearToSrgb, srgbToLinear } from "@vgpu/wgsl-std/color";
import { pi } from "@vgpu/wgsl-std/constants";
import { pcg3d } from "@vgpu/wgsl-std/hash";
import { luminance } from "../../core/image/color.wgsl";

// Film grain: soft particles of random tone scattered in source pixels, so every render of the
// photo shows the same grain. Particles lie at four fixed spacings, one to eight pixels apart, that
// never move: size slides a window across them, so finer grain fades as coarser grain comes in, and
// roughness widens it to mix in neighboring spacings and varies the particles' radius. The grain
// moves the encoded luminance, most in the midtones, and scales the channels together so color holds.
struct Params {
  amount: f32,
  size: f32,
  roughness: f32,
  // Source pixels per texel, so a reduced proxy samples the grain at the same document positions.
  scale: vec2f,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

// Four uniform values in [0, 1) for the particle of a cell.
fn random(cell: vec2i, octave: u32) -> vec4f {
  let hash = pcg3d(vec3u(bitcast<vec2u>(cell), octave)).xy;
  return vec4f(vec4u(hash & vec2u(0xffffu), hash >> vec2u(16u))) / 65536.0;
}

// One particle anywhere in each unit cell, a smooth bump with a radius of at most one cell, so only
// the 3×3 cells around `point` reach it, and a tone from -1 to 1. Unit variance on average.
fn particles(point: vec2f, octave: u32, roughness: f32) -> f32 {
  let base = vec2i(floor(point));
  let spread = 0.5 * roughness;
  var sum = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let cell = base + vec2i(x, y);
      let particle = random(cell, octave);
      let offset = point - vec2f(cell) - particle.xy;
      let radius = 1.0 - spread * particle.z;
      let bump = max(1.0 - dot(offset, offset) / (radius * radius), 0.0);
      sum += (particle.w * 2.0 - 1.0) * bump * bump * bump;
    }
  }
  // E[tone²] = 1/3 times E[∫bump²], which is πr²/7 for a bump of radius r.
  let radius2 = 1.0 - spread + spread * spread / 3.0;
  return sum / sqrt(pi * radius2 / 21.0);
}

const octaves = 4u;

fn grain(point: vec2f) -> f32 {
  let roughness = params.roughness / 100.0;
  // The window's center and width, in octaves.
  let center = f32(octaves - 1u) * params.size / 100.0;
  let width = 0.35 + 0.65 * roughness;
  var sum = 0.0;
  var power = 0.0;
  for (var octave = 0u; octave < octaves; octave++) {
    let weight = exp(-0.5 * pow((f32(octave) - center) / width, 2.0));
    if (weight < 0.02) {
      continue;
    }
    // Each spacing doubles the last; an offset keeps their cells from sharing edges.
    let cells = point / exp2(f32(octave)) + vec2f(0.37, 0.71) * f32(octave);
    sum += weight * particles(cells, octave, roughness);
    power += weight * weight;
  }
  // Independent octaves of unit variance add up to the square root of their weights' squares.
  return sum / sqrt(power);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  let light = luminance(input.rgb);
  if (light <= 0.0 || light >= 1.0) {
    return input;
  }
  let tone = linearToSrgb(light);
  // Strongest in the midtones and gone at black and white; at 100 it deviates 8% of the range there.
  let strength = params.amount / 100.0 * 0.08 * sqrt(4.0 * tone * (1.0 - tone));
  let grained = max(tone + strength * grain(position.xy * params.scale), 0.0);
  return vec4f(input.rgb * (srgbToLinear(grained) / light), input.a);
}
