import { View, imagePoint, previewColor, background, maskTint } from "./display.wgsl";
import { Transform, sourcePoint } from "../transform/transform.wgsl";
import { gradientCoverage } from "../blend/coverage.wgsl";

struct MaskOverlay {
  kind: u32,
  first: vec2f,
  second: vec2f,
  feather: f32,
  angle: f32,
  modifierCount: u32,
  sourceSize: vec2f,
  // The layer's opacity scales coverage in the mix pass, so the tint follows it.
  opacity: f32,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@group(0) @binding(3) var<uniform> transform: Transform;
@group(0) @binding(4) var original: texture_2d<f32>;
@group(0) @binding(5) var<uniform> split: f32;
@group(0) @binding(6) var<uniform> maskTransform: Transform;
@group(0) @binding(7) var<uniform> overlay: MaskOverlay;
@group(0) @binding(8) var<storage, read> modifiers: array<vec4f>;
@group(0) @binding(9) var coverage: texture_2d<f32>;

// The same coverage the mix pass applies: kind 3 reads a rasterized mask, the rest evaluate gradients in source pixels.
fn overlayCoverage(uv: vec2f) -> f32 {
  let point = sourcePoint(maskTransform, uv);
  if (overlay.kind == 3u) {
    return textureSampleLevel(coverage, sourceSampler, point, 0.0).r * overlay.opacity;
  }
  let position = point * overlay.sourceSize;
  var coverage = gradientCoverage(position, overlay.first, overlay.second, overlay.kind, overlay.feather, overlay.angle);
  for (var i = 0u; i < overlay.modifierCount; i++) {
    let points = modifiers[i * 2u];
    let settings = modifiers[i * 2u + 1u];
    coverage = clamp(coverage + gradientCoverage(position, points.xy, points.zw, u32(settings.y), settings.z, settings.w) * settings.x, 0.0, 1.0);
  }
  return coverage * overlay.opacity;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = sourcePoint(transform, imagePoint(view, uv));
  let edited = textureSampleLevel(source, sourceSampler, p, 0.0);
  let before = textureSampleLevel(original, sourceSampler, p, 0.0);
  var color = previewColor(select(edited, before, uv.x < split), view);
  if (overlay.kind != 0u) {
    color = maskTint(color, overlayCoverage(p));
  }
  let inside = all(p >= vec2f(0.0)) && all(p <= vec2f(1.0));
  return vec4f(select(background, color, inside), 1.0);
}
