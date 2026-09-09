struct GainParams {
  area: vec4f,
  points: vec3u,
  spacing: vec2f,
  origin: vec2f,
  weights: vec3f,
  minimum: f32,
  maximum: f32,
}
@group(0) @binding(2) var<uniform> gainParams: GainParams;
@group(0) @binding(3) var<storage, read> gains: array<f32>;

// Rec.2020 D65 to linear ProPhoto D50 (RIMM), with Bradford white adaptation.
// Only the gain lookup uses RIMM; multiplying all channels by a scalar commutes with conversion.
const rec2020ToRimm = mat3x3f(
  0.8351966, 0.0540223, -0.0023414,
  0.0488013, 0.9289382, 0.0363324,
  0.1159481, 0.0170555, 0.9658409,
);

fn tableGain(p: vec2u, index: f32) -> f32 {
  let base = (p.y * gainParams.points.x + p.x) * gainParams.points.z;
  let low = u32(index);
  let high = min(low + 1u, gainParams.points.z - 1u);
  return mix(gains[base + low], gains[base + high], fract(index));
}

// DNG 1.7.1 pp. 71–73: pixel-centered spatial interpolation, then input * N (not N-1).
fn profileGain(rgb: vec3f, stored: vec2f) -> f32 {
  if gainParams.points.z == 0u { return 1.0; }
  let rimm = rec2020ToRimm * rgb;
  let input = dot(rimm, gainParams.weights)
    + min(min(rimm.r, rimm.g), rimm.b) * gainParams.minimum
    + max(max(rimm.r, rimm.g), rimm.b) * gainParams.maximum;
  let index = min(clamp(input, 0.0, 1.0) * f32(gainParams.points.z), f32(gainParams.points.z - 1u));
  let position = (stored + 0.5 - gainParams.area.xy) / gainParams.area.zw;
  let grid = clamp((position - gainParams.origin) / gainParams.spacing,
    vec2f(0), vec2f(gainParams.points.xy - 1u));
  let low = vec2u(grid);
  let high = min(low + 1u, gainParams.points.xy - 1u);
  return mix(
    mix(tableGain(low, index), tableGain(vec2u(high.x, low.y), index), fract(grid.x)),
    mix(tableGain(vec2u(low.x, high.y), index), tableGain(high, index), fract(grid.x)),
    fract(grid.y));
}

struct Params {
  origin: vec2u,
  size: vec2u,
  orientation: u32,
  matrix: mat3x3f,
  neutral: vec3f,
  exposure: f32,
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
 let p = stored(vec2u(position.xy));
 let rgb = textureLoad(source, p, 0).rgb;
 // Fuse pointwise white balance and color conversion to avoid an extra full-size texture.
 // Keep channel headroom: display mapping happens after exposure and color conversion.
 let balanced = rgb / params.neutral;
 let working = (params.matrix * balanced) * params.exposure;
 return vec4f(working * profileGain(working, vec2f(p)), 1.0);
}
