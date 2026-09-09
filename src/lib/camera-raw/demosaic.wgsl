@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> pattern: vec4u;
// This stage is only installed for a supported CFA. LinearRaw never passes through it.
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let p = vec2i(position.xy);
 var sum = vec3f(0.0);
 var count = vec3f(0.0);
 for (var dy = -1; dy <= 1; dy++) {
  for (var dx = -1; dx <= 1; dx++) {
   let q = clamp(p + vec2i(dx, dy), vec2i(0), vec2i(textureDimensions(source)) - 1);
   let color = pattern[u32(q.y & 1) * 2u + u32(q.x & 1)];
   sum[color] += textureLoad(source, q, 0).r;
   count[color] += 1.0;
  }
 }
 return vec4f(sum / max(count, vec3f(1.0)), 1.0);
}
