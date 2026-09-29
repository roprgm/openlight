import { luminance } from "../../core/image/color.wgsl";

// Gray edge (van de Weijer, Gevers, and Gijsenij, 2007): differences between neighboring surfaces
// average to the light's color, so a large colored area counts only at its edges. One workgroup walks
// a grid of samples and reduces it to the photo's cast: red over blue, warm when positive, and green
// over their geometric mean, green when positive. Without usable edges, the mean color decides.
//
// The cast comes twice: in stops of light, which a RAW development's gains shift, and in the log odds
// the adjustments shift, where a channel moves less the brighter it is, taken at the level of the edges.
const samples = vec2u(512u, 320u);
const threads = 256u;
// A high norm leans on the strongest edges.
const norm = 6.0;

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> result: vec4f;

var<workgroup> edges: array<vec3f, threads>;
var<workgroup> levels: array<vec3f, threads>;
// Usable colors, summed, and in w their count.
var<workgroup> colors: array<vec4f, threads>;

fn tilt(channels: vec3f) -> vec2f {
  return vec2f(channels.r - channels.b, channels.g - 0.5 * (channels.r + channels.b));
}

fn sample(point: vec2u) -> vec4f {
  return textureLoad(source, point * textureDimensions(source) / samples, 0);
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
    color += vec4f(here.rgb, 1.0);
    let right = sample(min(point + vec2u(1u, 0u), samples - 1u));
    let below = sample(min(point + vec2u(0u, 1u), samples - 1u));
    if (usable(right) && usable(below)) {
      let across = right.rgb - here.rgb;
      let down = below.rgb - here.rgb;
      let strength = pow(sqrt(across * across + down * down), vec3f(norm));
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
    let stops = select(log2(mean), log2(edges[0]) / norm, edged);
    let odds = stops / (1.0 - select(mean, levels[0] / edges[0], edged));
    result = select(vec4f(0.0), vec4f(tilt(stops), tilt(odds)), all(mean > vec3f(0.0)));
  }
}
