import { display } from "../../core/image/color.wgsl";

// The average of the texels around a point, as the screen shows it: sRGB, clipped to its gamut, encoded.
struct Params {
  // The point as a fraction of the image's width and height.
  point: vec2f,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> color: vec4f;

@compute @workgroup_size(1) fn sample() {
  let size = vec2i(textureDimensions(source));
  let center = vec2i(params.point * vec2f(size));
  var total = vec3f(0.0);
  var count = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let texel = center + vec2i(x, y);
      if (all(texel >= vec2i(0)) && all(texel < size)) {
        total += textureLoad(source, texel, 0).rgb;
        count += 1.0;
      }
    }
  }
  color = vec4f(display(total / max(count, 1.0)), count);
}
