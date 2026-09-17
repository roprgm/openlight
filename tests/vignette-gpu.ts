import { effect, frame, init, target } from "vgpu";
import { createVignette } from "@/features/vignette/pass";
import { defaultAdjustments } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { defaultCurve } from "@/lib/tone-curves/curve";

/** A constant HDR color exposes spatial falloff without texture or display conversion. */
export async function probeVignette(size: [number, number]) {
	const gpu = await init();
	const input = target(gpu, { size, format: "rgba16float" });
	const fill = effect(
		gpu,
		`
		@fragment fn fs_main() -> @location(0) vec4f {
			return vec4f(4.0, 2.0, 0.5, 0.25);
		}
	`,
	);
	const vignette = createVignette(gpu, input);
	const scene = {
		source: "probe",
		frame: imageFrame(size),
		adjustments: defaultAdjustments,
		toneCurve: defaultCurve,
	};
	try {
		frame(gpu, (f) => f.pass(input, fill));
		const original = [...(await input.readFloats())];
		const outputs = [];
		for (const intensity of [0, 50, 100]) {
			for (const softness of [0, 50, 100]) {
				let output = input;
				frame(gpu, (f) => {
					output = vignette.render(f, input, {
						...scene,
						vignette: { intensity, softness },
					});
				});
				outputs.push({
					intensity,
					softness,
					pixels: [...(await output.readFloats())],
				});
			}
		}
		return { original, outputs };
	} finally {
		vignette.dispose();
		input.color.dispose();
		gpu.dispose();
	}
}
