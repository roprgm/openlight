// The spectrum lives in storage buffers: four half floats per texel, row after row.
export fn unpack(texel: vec2u) -> vec4f {
  return vec4f(unpack2x16float(texel.x), unpack2x16float(texel.y));
}

export fn pack(value: vec4f) -> vec2u {
  return vec2u(pack2x16float(value.xy), pack2x16float(value.zw));
}
