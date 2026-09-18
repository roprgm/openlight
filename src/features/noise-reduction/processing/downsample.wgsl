import { packColor, unpackColor } from "./color.wgsl";
@group(0) @binding(0) var source: texture_2d<f32>;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2i(position.xy) * 2;
  let last = vec2i(textureDimensions(source)) - 1;
  var sum = vec4f(0.0);
  var coverage = 1.0;
  for (var y = 0; y < 2; y++) {
    for (var x = 0; x < 2; x++) {
      let v = packColor(textureLoad(source, min(p + vec2i(x, y), last), 0));
      sum += v;
      coverage = min(coverage, v.a);
    }
  }
  // Average in the filter's perceptual space, without mixing hidden RGB into edges.
  return vec4f(unpackColor(sum.rgb / max(sum.a, 1e-10)), coverage);
}
