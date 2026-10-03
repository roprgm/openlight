import { luminance, toWorking } from "../../core/image/color.wgsl";

// Gray edge (van de Weijer, Gevers, and Gijsenij, 2007): differences between neighboring surfaces
// average to the light's color, so a large colored area counts only at its edges. One workgroup walks
// a grid of samples and reduces it to the light's color in stops, beside each channel's level where
// the edges are. Without usable edges, the mean color decides both. Brighter pixels weigh more, since
// shadows take their color from whatever light fills them.
const samples = vec2u(512u, 320u);
const threads = 256u;
// A high norm leans on the strongest edges.
const norm = 6.0;

struct Light {
  stops: vec3f,
  level: vec3f,
}

@group(0) @binding(0) var source: texture_2d<f32>;
// The primaries the source's texels are in, as toWorking numbers them.
@group(0) @binding(1) var<uniform> primaries: u32;
@group(0) @binding(2) var<storage, read_write> light: Light;

var<workgroup> edges: array<vec3f, threads>;
var<workgroup> levels: array<vec3f, threads>;
// Usable colors, summed, and in w their count.
var<workgroup> colors: array<vec4f, threads>;

fn sample(point: vec2u) -> vec4f {
  let texel = textureLoad(source, point * textureDimensions(source) / samples, 0);
  return vec4f(toWorking(texel.rgb, primaries), texel.a);
}

// Opaque, bright enough that noise doesn't decide its color, and short of highlights, which clip or
// roll off to white whatever the light.
fn usable(color: vec4f) -> bool {
  return color.a > 0.5 && max(color.r, max(color.g, color.b)) < 0.85 && luminance(color.rgb) > 0.005;
}

@compute @workgroup_size(threads) fn measure(@builtin(local_invocation_index) thread: u32) {
  var edge = vec3f(0.0);
  var level = vec3f(0.0);
  var color = vec4f(0.0);
  for (var i = thread; i < samples.x * samples.y; i += threads) {
    let point = vec2u(i % samples.x, i / samples.x);
    let here = sample(point);
    if (!usable(here)) {
      continue;
    }
    let weight = luminance(here.rgb);
    color += vec4f(here.rgb, 1.0) * weight;
    let right = sample(min(point + vec2u(1u, 0u), samples - 1u));
    let below = sample(min(point + vec2u(0u, 1u), samples - 1u));
    if (usable(right) && usable(below)) {
      let across = right.rgb - here.rgb;
      let down = below.rgb - here.rgb;
      let strength = pow(sqrt(across * across + down * down), vec3f(norm)) * weight;
      edge += strength;
      level += strength * here.rgb;
    }
  }
  edges[thread] = edge;
  levels[thread] = level;
  colors[thread] = color;
  workgroupBarrier();
  for (var stride = threads / 2u; stride > 0u; stride /= 2u) {
    if (thread < stride) {
      edges[thread] += edges[thread + stride];
      levels[thread] += levels[thread + stride];
      colors[thread] += colors[thread + stride];
    }
    workgroupBarrier();
  }
  if (thread == 0u) {
    let mean = colors[0].rgb / colors[0].w;
    let edged = all(edges[0] > vec3f(0.0));
    light = Light(
      select(log2(mean), log2(edges[0]) / norm, edged),
      select(mean, levels[0] / edges[0], edged),
    );
  }
}
