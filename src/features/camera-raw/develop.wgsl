struct Params {
  size: vec2u, crop: vec4u, orientation: u32,
  cfa: vec4u, black: vec4f, white: f32, balance: vec4f, matrix: mat3x3f,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
fn site(p: vec2i) -> u32 { return u32(p.y & 1) * 2u + u32(p.x & 1); }
fn sensor(position: vec2i) -> f32 {
  // Extend edges with the nearest site of the same CFA color.
  let p = clamp(position, position & vec2i(1), vec2i(params.size) - 1 - ((vec2i(params.size) - 1 - position) & vec2i(1)));
  let index = site(p);
  var value = textureLoad(source, p, 0).r;
  return (value - params.black[index]) / (params.white - params.black[index]) * params.balance[index];
}
// Malvar–He–Cutler 5×5 linear reconstruction, ICASSP 2004, Figure 2.
// https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/Demosaicing_ICASSP04.pdf
fn demosaic(p: vec2i) -> vec3f {
  let center = sensor(p);
  let near = vec2f(sensor(p+vec2i(-1,0))+sensor(p+vec2i(1,0)),sensor(p+vec2i(0,-1))+sensor(p+vec2i(0,1)));
  let far = vec2f(sensor(p+vec2i(-2,0))+sensor(p+vec2i(2,0)),sensor(p+vec2i(0,-2))+sensor(p+vec2i(0,2)));
  let diagonal = sensor(p+vec2i(-1,-1))+sensor(p+vec2i(1,-1))+sensor(p+vec2i(-1,1))+sensor(p+vec2i(1,1));
  let own = params.cfa[site(p)];
  var color = vec3f(0.0);
  color[own] = center;
  if own!=1u {
    color.g = .5*center+.25*(near.x+near.y)-.125*(far.x+far.y);
    color[2u-own] = .75*center+.25*diagonal-.1875*(far.x+far.y);
  } else {
    let horizontal = params.cfa[site(p+vec2i(1,0))];
    let interpolated = vec2f(.625*center-.125*diagonal)+.5*near-.125*far+.0625*far.yx;
    color[horizontal] = interpolated.x;
    color[2u-horizontal] = interpolated.y;
  }
  return color;
}
fn highlights(color: vec3f) -> vec3f {
  // Near sensor saturation, roll toward a common camera-channel ceiling before
  // the color matrix. Restore peak brightness so highlights retain HDR headroom.
  var gains = vec3f(1.0);
  for (var i = 0u; i<4u; i++) { gains[params.cfa[i]] = params.balance[i]; }
  let sensorRgb = color/gains;
  let clipped = smoothstep(0.8,1.0,max(sensorRgb.r,max(sensorRgb.g,sensorRgb.b)));
  let ceiling = min(gains.r,min(gains.g,gains.b));
  let peak = max(color.r,max(color.g,color.b));
  let highlight = min(color,vec3f(ceiling))*max(1.0,peak/ceiling);
  return mix(color,highlight,clipped);
}
@fragment fn fs_main(@builtin(position) position:vec4f)->@location(0) vec4f {
 var p = vec2u(position.xy);
 if params.orientation>=5u {p = p.yx;}
 if params.orientation==2u || params.orientation==3u || params.orientation==7u || params.orientation==8u {p.x = params.crop.z-1u-p.x;}
 if params.orientation==3u || params.orientation==4u || params.orientation==6u || params.orientation==7u {p.y = params.crop.w-1u-p.y;}
 p+=params.crop.xy;
 return vec4f(params.matrix*highlights(demosaic(vec2i(p))),1.0);
}
