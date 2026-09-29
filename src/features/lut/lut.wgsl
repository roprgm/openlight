import { srgbToLinear3 } from "@vgpu/wgsl-std/color";
import { display, srgbToRec2020 } from "../../core/image/color.wgsl";

// Creative LUTs take and return display-referred sRGB. The LUT sees the working color as a screen
// shows it, clipped to sRGB with its hue and luminance kept, so headroom above white clips here;
// what it returns is clamped to the same range.
struct Params {
  size: u32,
  domainMin: vec3f,
  domainMax: vec3f,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> table: array<f32>;

fn entry(point: vec3u) -> vec3f {
  let index = 3u * (point.r + params.size * (point.g + params.size * point.b));
  return vec3f(table[index], table[index + 1u], table[index + 2u]);
}

// Tetrahedral interpolation: the lattice cell splits along its gray diagonal into six tetrahedra, so
// a LUT that keeps grays neutral keeps them neutral between its points too.
fn lookup(color: vec3f) -> vec3f {
  let range = params.domainMax - params.domainMin;
  let last = f32(params.size - 1u);
  let position = clamp((color - params.domainMin) / range, vec3f(0.0), vec3f(1.0)) * last;
  let cell = min(floor(position), vec3f(last - 1.0));
  let f = position - cell;
  let base = vec3u(cell);
  // The corners between the cell's darkest and brightest, taken along the largest fractions first.
  var first: vec3u;
  var second: vec3u;
  var sorted: vec3f;
  if (f.r >= f.g && f.g >= f.b) {
    first = vec3u(1u, 0u, 0u); second = vec3u(1u, 1u, 0u); sorted = f.rgb;
  } else if (f.r >= f.g && f.r >= f.b) {
    first = vec3u(1u, 0u, 0u); second = vec3u(1u, 0u, 1u); sorted = f.rbg;
  } else if (f.r >= f.g) {
    first = vec3u(0u, 0u, 1u); second = vec3u(1u, 0u, 1u); sorted = f.brg;
  } else if (f.g >= f.b && f.r >= f.b) {
    first = vec3u(0u, 1u, 0u); second = vec3u(1u, 1u, 0u); sorted = f.grb;
  } else if (f.g >= f.b) {
    first = vec3u(0u, 1u, 0u); second = vec3u(0u, 1u, 1u); sorted = f.gbr;
  } else {
    first = vec3u(0u, 0u, 1u); second = vec3u(0u, 1u, 1u); sorted = f.bgr;
  }
  return (1.0 - sorted.x) * entry(base)
    + (sorted.x - sorted.y) * entry(base + first)
    + (sorted.y - sorted.z) * entry(base + second)
    + sorted.z * entry(base + 1u);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  let graded = clamp(lookup(display(input.rgb)), vec3f(0.0), vec3f(1.0));
  return vec4f(srgbToRec2020 * srgbToLinear3(graded), input.a);
}
