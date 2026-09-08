import { compute, effect, frame, type Gpu, target } from "vgpu";
import shader from "./raster.wgsl";
import unpackShader from "./unpack.wgsl";

/** Decompressed sample blocks; sensor/color interpretation stays on the GPU. */
export type Raster = {
	width: number;
	height: number;
	channels: number;
	bits: number;
	format: number;
	predictor: number;
	little: number;
	orientation: number;
	photo: number;
	alpha: number;
	chunks: {
		data: Uint8Array;
		x: number;
		y: number;
		width: number;
		height: number;
		plane: number;
		samples: number;
		rowBytes: number;
	}[];
	matrix: number[];
	curves: Float32Array<ArrayBuffer>;
};

/** Owns reusable import pipelines; each invocation owns and releases its staging resources. */
export function createRasterImporter(gpu: Gpu) {
	const unpack = compute(gpu, unpackShader);
	const develop = effect(gpu, shader);
	return async (raster: Raster) => {
		const {
			width,
			height,
			channels,
			bits,
			format,
			predictor,
			little,
			orientation,
			matrix,
		} = raster;
		const limit = gpu.gpu.limits.maxTextureDimension2D;
		if (width > limit || height > limit) {
			throw new Error(
				`Image exceeds the GPU texture limit of ${limit} pixels.`,
			);
		}

		const size: [number, number] =
			orientation >= 5 ? [height, width] : [width, height];
		const source = gpu.device.createTexture({
			size: [width, height, channels],
			format: "r32float",
			usage: ["texture_binding", "copy_dst"],
		});
		const temporary: { dispose(): void }[] = [source];
		let image: ReturnType<typeof target> | undefined;
		try {
			const invalid = gpu.device.createBuffer({
				size: 4,
				usage: ["storage", "copy_src"],
			});
			temporary.push(invalid);
			for (const chunk of raster.chunks) {
				const stride = Math.ceil(chunk.width / 64) * 64;
				const outputSize = stride * 4 * chunk.height * chunk.samples;
				const scratchSize = predictor === 3 ? chunk.data.length * 4 : 4;
				if (
					Math.max(outputSize, scratchSize, chunk.data.length) >
					gpu.gpu.limits.maxStorageBufferBindingSize
				) {
					throw new Error("TIFF row exceeds the GPU buffer limit.");
				}
				const packed = new Uint8Array(Math.ceil(chunk.data.length / 4) * 4);
				packed.set(chunk.data);
				const buffers: { dispose(): void }[] = [];
				try {
					const input = gpu.device.createBuffer({
						size: packed.length,
						usage: ["storage", "copy_dst"],
					});
					buffers.push(input);
					const output = gpu.device.createBuffer({
						size: outputSize,
						usage: ["storage", "copy_src"],
					});
					buffers.push(output);
					const scratch = gpu.device.createBuffer({
						size: scratchSize,
						usage: ["storage"],
					});
					buffers.push(scratch);
					input.write(packed);
					unpack
						.set({
							packed: input,
							output,
							scratch,
							invalid,
							params: {
								width: chunk.width,
								height: chunk.height,
								samples: chunk.samples,
								rowBytes: chunk.rowBytes,
								bits,
								format,
								predictor,
								little,
								stride,
							},
						})
						.dispatch(
							Math.ceil(
								(chunk.height *
									(predictor === 1 ? chunk.width * chunk.samples : 1)) /
									64,
							),
						);
					const encoder = gpu.gpu.createCommandEncoder();
					for (let c = 0; c < chunk.samples; c++) {
						encoder.copyBufferToTexture(
							{
								buffer: output.gpu,
								offset: c * stride * 4 * chunk.height,
								bytesPerRow: stride * 4,
								rowsPerImage: chunk.height,
							},
							{
								texture: source.gpu,
								origin: [chunk.x, chunk.y, chunk.plane + c],
							},
							[Math.min(chunk.width, width - chunk.x), chunk.height, 1],
						);
					}
					gpu.gpu.queue.submit([encoder.finish()]);
				} finally {
					for (const buffer of buffers) {
						buffer.dispose();
					}
				}
			}
			const curveBuffer = gpu.device.createBuffer({
				size: raster.curves.byteLength,
				usage: ["storage", "copy_dst"],
			});
			temporary.push(curveBuffer);
			curveBuffer.write(raster.curves);
			image = target(gpu, { size, format: "rgba16float" });
			const params = {
				size: [width, height],
				orientation,
				channels,
				photo: raster.photo,
				alpha: raster.alpha,
				maximum: format === 3 ? 1 : 2 ** bits - 1,
				matrix,
			};
			const output = image;
			frame(gpu, (f) =>
				f.pass(
					output,
					develop.set({
						source: source.createView({ dimension: "2d-array" }),
						curves: curveBuffer,
						params,
						invalid,
					}),
				),
			);
			// Read only the four-byte validity flag; image pixels stay on the GPU.
			const failure = new Uint32Array(await invalid.read(4))[0];
			if (failure & 1) {
				throw new Error("TIFF contains nonfinite floating-point samples.");
			}
			if (failure & 2) {
				throw new Error("Image values exceed the editor's half-float range.");
			}
			return image;
		} catch (error) {
			image?.color.dispose();
			throw error;
		} finally {
			for (const resource of temporary) {
				resource.dispose();
			}
		}
	};
}
