import { toOklab, fromOklab } from "../../core/image/oklab.wgsl";
import { luminance, rec2020ToSrgb, srgbToRec2020 } from "../../core/image/color.wgsl";

// Selective color in Oklab: at +/-100 a range turns hue 30 degrees, scales chroma 0..2x or moves luminance one stop.
// The import above is relative because the shader loader does not resolve the `@/` alias.

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> settings: array<vec4f>;

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
