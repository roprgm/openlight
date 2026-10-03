import { tone, toneSamples } from "./tone.wgsl";

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> curve: array<f32>;

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let input = textureLoad(source, vec2i(position.xy), 0);
  let size = arrayLength(&curve);
  let at = toneSamples(input.rgb, size);
  let samples = vec4f(curve[at.x], curve[at.y], curve[at.z], curve[at.w]);
  return vec4f(tone(input.rgb, samples, size), input.a);
}
