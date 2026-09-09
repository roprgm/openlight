struct Params {
 origin: vec2i,
 repeat: vec2u,
 samples: u32,
 scale: f32,
 white: vec4f,
 lookup: u32,
 lookupSize: u32,
 deltaH: u32,
 deltaHSize: u32,
 deltaV: u32,
 deltaVSize: u32,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> levels: array<f32>;
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
 let p = vec2i(position.xy);
 let local = p - params.origin;
 let repeatSize = vec2i(params.repeat);
 let phase = vec2u(((local % repeatSize) + repeatSize) % repeatSize);
 let cell = (phase.y * params.repeat.x + phase.x) * params.samples;
 var value = textureLoad(source, p, 0).rgb * params.scale;
 for (var c = 0u; c < 3u; c++) {
  let channel = min(c, params.samples - 1u);
  if params.lookupSize > 0u {
   value[c] = levels[params.lookup + min(u32(max(round(value[c]),0.0)), params.lookupSize - 1u)];
  }
  var black = levels[cell + channel];
  if local.x >= 0 && u32(local.x) < params.deltaHSize { black += levels[params.deltaH + u32(local.x)]; }
  if local.y >= 0 && u32(local.y) < params.deltaVSize { black += levels[params.deltaV + u32(local.y)]; }
  value[c] = (value[c] - black) / max(params.white[channel] - black, 1e-20);
 }
 return vec4f(value, 1.0);
}
