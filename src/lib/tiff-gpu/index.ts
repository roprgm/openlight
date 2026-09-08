import type { Gpu } from "vgpu";
import { type PrepareOptions, prepareTiff } from "./prepare";
import { type UploadOptions, uploadTiff } from "./upload";

export { parseTiff, type TiffInfo } from "./ifd";
export { type Prepared, type PrepareOptions, prepareTiff } from "./prepare";
export { type TiffTexture, type UploadOptions, uploadTiff } from "./upload";

/** File bytes to an `rgba16uint` texture of scaled samples. `prepareTiff` alone can run in a worker. */
export async function decodeTiff(
	gpu: Gpu,
	bytes: ArrayBuffer,
	options: PrepareOptions & UploadOptions = {},
) {
	return uploadTiff(gpu, await prepareTiff(bytes, options), options);
}
