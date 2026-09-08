import { effect, frame, type Gpu, type Target, target } from "vgpu";
import type { Development } from "@/lib/editor/document/resources";
import shader from "./develop.wgsl";
import { createWhiteBalance } from "./white-balance";
import type { Sensor } from "./worker";

/** Owns the decoded sensor; renderers own outputs. Insert sensor denoising before this pass. */
export async function createDevelopment(
	gpu: Gpu,
	source: Target,
	sensor: Sensor,
) {
	const { params, xyzToCamera } = sensor;
	const { crop, orientation, cfa, balance } = params;
	const size: [number, number] = [crop[2], crop[3]];
	if (orientation >= 5) {
		size.reverse();
	}
	const develop = effect(gpu, shader).set({ source, params });
	const image = target(gpu, { size, format: "rgba16float" });
	try {
		frame(gpu, (f) => f.pass(image, develop));
		await gpu.gpu.queue.onSubmittedWorkDone();
		const balanceControl = createWhiteBalance({ xyzToCamera, cfa, balance });
		if (!balanceControl) {
			source.color.dispose();
			return { image };
		}
		const development: Development = {
			defaults: balanceControl.asShot,
			dispose: () => source.color.dispose(),
			create() {
				const output = target(gpu, { size, format: "rgba16float" });
				let previous: Readonly<Record<string, number>>;
				return {
					image: output,
					render(frame, settings) {
						if (previous === settings) {
							return;
						}
						frame.pass(
							output,
							develop.set({
								params: { ...params, balance: balanceControl.gains(settings) },
							}),
						);
						previous = settings;
					},
					dispose: () => output.color.dispose(),
				};
			},
		};
		return { image, development };
	} catch (error) {
		image.color.dispose();
		throw error;
	}
}
