import { effect, frame, type Gpu, target } from "vgpu";
import { workerDecoder } from "@/lib/decode/worker-decoder";
import { createDevelopment } from "./development";
import shader from "./unpack.wgsl";
import type { Sensor } from "./worker";

export function createLoader(gpu: Gpu) {
	const unpack = effect(gpu, shader);
	const decoder = workerDecoder<Sensor>(() => import("./worker?worker"));
	return async (file: Blob) => {
		const sensor = await (await decoder())(file);
		const { size, crop, orientation } = sensor.params;
		if (
			Math.max(...size) > gpu.gpu.limits.maxTextureDimension2D ||
			sensor.data.length > gpu.gpu.limits.maxStorageBufferBindingSize
		) {
			throw Error("Image exceeds GPU limits.");
		}
		if (
			!orientation ||
			crop.some((v) => v < 0) ||
			!crop[2] ||
			!crop[3] ||
			crop[0] + crop[2] > size[0] ||
			crop[1] + crop[3] > size[1]
		) {
			throw Error("Invalid RAW crop or orientation.");
		}
		const source = target(gpu, {
			size: [size[0], size[1]],
			format: "r32float",
		});
		const packed = new Uint8Array(Math.ceil(sensor.data.length / 4) * 4);
		packed.set(sensor.data);
		const input = gpu.device.createBuffer({
			size: packed.length,
			usage: ["storage", "copy_dst"],
		});
		const curve = gpu.device.createBuffer({
			size: sensor.curve.length,
			usage: ["storage", "copy_dst"],
		});
		try {
			input.write(packed);
			curve.write(sensor.curve);
			frame(gpu, (f) =>
				f.pass(
					source,
					unpack.set({
						input,
						curve,
						params: { size, packing: sensor.packing },
					}),
				),
			);
			return await createDevelopment(gpu, source, sensor);
		} catch (error) {
			source.color.dispose();
			throw error;
		} finally {
			input.dispose();
			curve.dispose();
		}
	};
}
