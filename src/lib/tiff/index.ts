import type { Gpu } from "vgpu";
import { workerDecoder } from "@/lib/decode/worker-decoder";
import { createRasterImporter, type Raster } from "./raster";

export function createLoader(gpu: Gpu) {
	const upload = createRasterImporter(gpu);
	const decoder = workerDecoder<Raster>(() => import("./worker?worker"));
	return async (file: Blob) => ({
		image: await upload(await (await decoder())(file)),
	});
}
