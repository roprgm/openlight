import { display, rec2020ToSrgb } from "../../image/color.wgsl";

export struct View {
  size: vec2f,
  fitSize: vec2f,
  imageSize: vec2f,
  pan: vec2f,
  zoom: f32,
  shadows: u32,
  highlights: u32,
}
export const background = vec3f(0.09);
// #f25445 as displayed; the overlay mixes after encoding, on the final sRGB color.
const overlayTint = vec3f(0.949, 0.329, 0.271);

export fn imagePoint(view: View, uv: vec2f) -> vec2f {
  let scale = min(min(view.fitSize.x / view.imageSize.x, view.fitSize.y / view.imageSize.y), 2.0) * view.zoom;
  return ((uv - 0.5) * view.size - view.pan) / (view.imageSize * scale) + 0.5;
}
export fn previewColor(sample: vec4f, view: View) -> vec3f {
  let rgb = rec2020ToSrgb * sample.rgb;
  var color = display(sample.rgb);
  if (sample.a > 0.0) {
    if (view.shadows != 0u && all(rgb <= vec3f(0.0))) {
      color = vec3f(0.0, 0.0, 1.0);
    }
    if (view.highlights != 0u && any(rgb >= vec3f(1.0))) {
      color = vec3f(1.0, 0.0, 0.0);
    }
  }
  return mix(background, color, sample.a);
}
/** Tints a displayed color by mask coverage: untouched at 0, half red at 1. */
export fn maskTint(color: vec3f, coverage: f32) -> vec3f {
  return mix(color, overlayTint, coverage * 0.5);
}
