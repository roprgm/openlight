struct Rect { origin: vec2u, rowWords: u32, wide: u32 }
@group(0) @binding(0) var<uniform> rect: Rect;
@group(0) @binding(1) var<storage, read> pixels: array<u32>;

// Copies a band's packed pixels into its rectangle of the target; the pass scissor bounds it.
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = vec2u(position.xy) - rect.origin;
  if rect.wide == 1u {
    let at = p.y * rect.rowWords + p.x * 4u;
    return vec4f(bitcast<f32>(pixels[at]), bitcast<f32>(pixels[at + 1u]), bitcast<f32>(pixels[at + 2u]), bitcast<f32>(pixels[at + 3u]));
  }
  let at = p.y * rect.rowWords + p.x * 2u;
  return vec4f(unpack2x16float(pixels[at]), unpack2x16float(pixels[at + 1u]));
}
