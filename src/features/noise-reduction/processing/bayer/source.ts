import type { Gpu } from "vgpu";
import type { RawDevelopment, RawSensor } from "@/core/image";
import { denoiseBayer, supportsBayerDenoising } from "./index";

/** One private filtered sensor shared by the feature's preview/export cache. */
export function createBayerDenoising(
	gpu: Gpu,
	sensor: RawDevelopment["sensor"],
) {
	if (!sensor || !supportsBayerDenoising(sensor.metadata)) {
		return;
	}
	const input = sensor;
	const controller = new AbortController();
	let filtered: RawSensor | undefined;
	let pending: Promise<RawSensor> | undefined;
	async function calculate() {
		const source = await input.clone(controller.signal);
		try {
			await denoiseBayer(gpu, source, controller.signal);
			controller.signal.throwIfAborted();
			filtered = source;
			return source;
		} catch (error) {
			source.dispose();
			throw error;
		}
	}
	return {
		prepare() {
			controller.signal.throwIfAborted();
			if (filtered) {
				return Promise.resolve(filtered);
			}
			pending ??= calculate().finally(() => {
				pending = undefined;
			});
			return pending;
		},
		dispose() {
			controller.abort();
			filtered?.dispose();
		},
	};
}
