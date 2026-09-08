struct Params {size:vec2u,packing:u32}
@group(0) @binding(0) var<storage,read> input:array<u32>;
@group(0) @binding(1) var<storage,read> curve:array<u32>;
@group(0) @binding(2) var<uniform> params:Params;
fn bits(start:u32,offset:u32,count:u32)->u32 {
 let bit = start*8u+offset;
 let shift = bit%32u;
 var v = input[bit/32u]>>shift;
 if shift+count>32u {v|=input[bit/32u+1u]<<(32u-shift);}
 return v&((1u<<count)-1u);
}
fn sony(row:u32,index:u32)->u32 {
 let start = row*params.size.x+(index/32u)*32u+(index%2u)*16u;
 let maximum = bits(start,0u,11u);
 let minimum = bits(start,11u,11u);
 let high = bits(start,22u,4u);
 let low = bits(start,26u,4u);
 let position = (index%32u)/2u;
 if position==high {return maximum*2u;}
 if position==low {return minimum*2u;}
 var shift = 0u;
 while shift<4u && ((maximum-minimum)>>shift)>127u {shift++;}
 let delta = position-u32(position>high)-u32(position>low);
 return min(2047u,minimum+(bits(start,30u+delta*7u,7u)<<shift))*2u;
}
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) f32 {
 let id = vec2u(position.xy);
 if params.packing == 1u {
  let value = sony(id.y, id.x);
  return f32((curve[value / 2u] >> ((value % 2u) * 16u)) & 65535u);
 }
 let index = id.y * params.size.x + id.x;
 return f32((input[index / 2u] >> ((index % 2u) * 16u)) & 65535u);
}
