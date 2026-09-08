import type { Gpu, Target } from "vgpu";
import { type PrepareOptions, prepareTiff } from "./prepare";
import { type UploadOptions, uploadTiff } from "./upload";

export type { ColorSpace } from "./color";
export {
	type Directory,
	parseTiff,
	readTiff,
	type Tiff,
	type TiffInfo,
} from "./ifd";
export { type Prepared, type PrepareOptions, prepareTiff } from "./prepare";
export { type UploadOptions, uploadTiff } from "./upload";

export type DecodeOptions = PrepareOptions & UploadOptions;

/** File bytes to a linear rgba16float target, oriented, with straight alpha. `prepareTiff` alone can run in a worker. */
export async function decodeTiff(
	gpu: Gpu,
	bytes: ArrayBuffer,
	options: DecodeOptions = {},
): Promise<Target> {
	return uploadTiff(gpu, await prepareTiff(bytes, options), options);
}
