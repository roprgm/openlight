import { effect, frame, init, target } from "vgpu";
import shader from "@/features/noise-reduction/processing/chroma.wgsl";

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
      let brightness = 0.06 + 0.014 * p.x / params.x;
      let rgb = vec3f(brightness + params.y, brightness, brightness - params.y);
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
