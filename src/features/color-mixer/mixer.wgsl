import { luminance, rec2020ToSrgb, srgbToRec2020 } from "../../lib/color.wgsl";

// Selective color in Oklab: at +/-100 a range turns hue 30 degrees, scales chroma 0..2x or moves luminance one stop.
// The import above is relative because the shader loader does not resolve the `@/` alias.

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> settings: array<vec4f>;

// Bjorn Ottosson's public-domain Oklab transforms (2021 matrices):
// https://bottosson.github.io/posts/oklab/
fn toOklab(rgb: vec3f) -> vec3f {
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

fn fromOklab(lab: vec3f) -> vec3f {
  let lms = mat3x3f(
    1.0, 1.0, 1.0,
    0.3963377774, -0.1055613458, -0.0894841775,
    0.2158037573, -0.0638541728, -1.2914855480,
  ) * lab;
  return mat3x3f(
    4.0767416621, -1.2684380046, -0.0041960863,
    -3.3077115913, 2.6097574011, -0.7034186147,
    0.2309699292, -0.3413193965, 1.7076147010,
  ) * (lms * lms * lms);
}

// Adjacent ranges crossfade once, including magenta -> red across the hue seam.
fn adjustment(hue: f32) -> vec3f {
  let angle = select(hue, hue + 360.0, hue < settings[0].w);
  for (var i = 0u; i < 8u; i++) {
    let next = (i + 1u) % 8u;
    let end = settings[next].w + select(0.0, 360.0, next == 0u);
    if (angle >= settings[i].w && angle <= end) {
      return mix(settings[i].xyz, settings[next].xyz, smoothstep(settings[i].w, end, angle));
    }
  }
  return vec3f(0.0);
}

fn mixColor(color: vec3f) -> vec3f {
  let light = luminance(color);
  if (light <= 0.0) { return color; }
  let lab = toOklab(rec2020ToSrgb * color);
  // Fade the selection near neutral so tiny chroma/noise cannot tint gray areas.
  let strength = smoothstep(0.01, 0.04, length(lab.yz) / max(abs(lab.x), 0.000001));
  let change = adjustment(degrees(atan2(lab.z, lab.y))) * (strength / 100.0);
  if (all(change == vec3f(0.0))) { return color; }
  let angle = radians(change.x * 30.0);
  let rotation = mat2x2f(cos(angle), sin(angle), -sin(angle), cos(angle));
  let chroma = rotation * lab.yz * (1.0 + change.y);
  let mixed = srgbToRec2020 * fromOklab(vec3f(lab.x, chroma));
  // Preserve linear luminance during hue/chroma edits; luminance spans +/- one stop.
  // Keep extended RGB and HDR headroom for the existing display gamut mapping.
  return (mixed + vec3f(light - luminance(mixed))) * exp2(change.z);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  return vec4f(mixColor(input.rgb), input.a);
}
