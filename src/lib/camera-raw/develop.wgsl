struct Params {
  origin: vec2u,
  size: vec2u,
  orientation: u32,
  matrix: mat3x3f,
  neutral: vec3f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;

// Where this output pixel sits in the stored image, undoing the orientation tag within the crop.
fn stored(output: vec2u) -> vec2i {
  var p = output;
  let o = params.orientation;
  if o >= 5u { p = p.yx; }
  if o == 2u || o == 3u || o == 7u || o == 8u { p.x = params.size.x - 1u - p.x; }
  if o == 3u || o == 4u || o == 6u || o == 7u { p.y = params.size.y - 1u - p.y; }
  return vec2i(params.origin + p);
}

// Final camera-color conversion, crop and orientation, shared by CFA and LinearRaw.
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let rgb = textureLoad(source, stored(vec2u(position.xy)), 0).rgb;
 // Fuse pointwise white balance and color conversion to avoid an extra full-size texture.
 // Preserve the existing development highlight policy.
 let balanced = min(rgb / params.neutral, vec3f(1.0));
 return vec4f(params.matrix * balanced, 1.0);
}
