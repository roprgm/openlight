import { effect, frame, init, target } from "vgpu";
import shader from "@/features/noise-reduction/processing/chroma-pyramid.wgsl";
import { estimateNoise } from "@/features/noise-reduction/processing/noise";

/** A continuous dark ramp crossing a measured noise-bin boundary, with a fixed color correction. */
export async function renderChromaRamp() {
	const gpu = await init();
	const source = target(gpu, { size: [128, 8], format: "rgba32float" });
	const coarse = target(gpu, { size: [64, 4], format: source.format });
	const filtered = target(gpu, { size: coarse.size, format: source.format });
	const output = target(gpu, { size: source.size, format: source.format });
	const fill = effect(
		gpu,
		`
    @group(0) @binding(0) var<uniform> params: vec2f;
    @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
      if params.y > 0.02 {
        if all(vec2i(p.xy) == vec2i(90, 4)) { return vec4f(3.0, 1.0, 0.5, 1.0); }
        if all(vec2i(p.xy) == vec2i(100, 4)) { return vec4f(-0.02, 0.001, 0.002, 1.0); }
        if all(vec2i(p.xy) == vec2i(110, 4)) { return vec4f(0.01, 0.02, 0.03, 0.5); }
      }
      let brightness = 0.06 + 0.014 * p.x / params.x;
      let spike = select(0.0, 0.6, params.y > 0.02 && all(vec2i(p.xy) == vec2i(64, 4)));
      let rgb = vec3f(brightness + params.y + spike, brightness, brightness - params.y);
      let linear = select(pow((rgb + 0.055) / 1.055, vec3f(2.4)), rgb / 12.92, rgb <= vec3f(0.04045));
      let r = linear.r; let g = linear.g; let b = linear.b;
      return vec4f(0.6274*r + 0.3293*g + 0.0433*b,
        0.0691*r + 0.9195*g + 0.0114*b, 0.0164*r + 0.088*g + 0.8956*b, 1.0);
    }
  `,
	);
	try {
		frame(gpu, (f) =>
			f.pass(source, fill.set({ params: [source.size[0], 0.025] })),
		);
		frame(gpu, (f) =>
			f.pass(coarse, fill.set({ params: [coarse.size[0], 0.01] })),
		);
		frame(gpu, (f) =>
			f.pass(filtered, fill.set({ params: [filtered.size[0], 0] })),
		);
		frame(gpu, (f) => {
			f.pass(
				output,
				effect(gpu, shader).set({
					source,
					coarse,
					coarseFiltered: filtered,
					preserveLuminance: 1,
					variance: Array.from({ length: 16 }, (_, i) => {
						const variance = i === 0 ? 1e-6 : 0.002;
						return [variance, variance, variance, 1e-10];
					}),
				}),
			);
		});
		return {
			before: [...(await source.readFloats())],
			after: [...(await output.readFloats())],
		};
	} finally {
		for (const image of [source, coarse, filtered, output]) {
			image.color.dispose();
		}
		gpu.dispose();
	}
}

/** Noise confined to the bottom of a coarse level used to miss every sample. */
export async function sampleShadowNoise() {
	const gpu = await init();
	const source = target(gpu, { size: [40, 40], format: "rgba32float" });
	try {
		frame(gpu, (f) =>
			f.pass(
				source,
				effect(
					gpu,
					`
   @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
    let n = fract(sin(dot(p.xy, vec2f(12.9898,78.233))) * vec3f(43758.5453,22578.1459,19642.349));
    return vec4f(select(vec3f(0.2), vec3f(0.03) + (n-0.5)*0.03, p.y >= 24.0), 1.0);
   }`,
				),
			),
		);
		return await estimateNoise(gpu, source);
	} finally {
		source.color.dispose();
		gpu.dispose();
	}
}
