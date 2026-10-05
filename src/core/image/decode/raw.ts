import { createRawDecoder, type RawSource } from "raw-webgpu";
import { type Gpu, type Target, type Texture, target } from "vgpu";
import {
  createImageSource,
  type Mosaic,
  type RawDevelopment,
} from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import blendShader from "./raw-blend.wgsl";

/** One decoder per GPU, released with its device. */
const decoder = weakMemo((gpu: Gpu) => createRawDecoder(gpu.gpu));

const blendPipeline = weakMemo((device: GPUDevice) => {
  const module = device.createShaderModule({ code: blendShader.wgsl });
  return device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs_main" },
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [{ format: "r16uint" }],
    },
  });
});

/**
 * The samples the package develops, which live in its own `sensor` texture. Passes take turns: each
 * writes the samples it develops just before developing, in the same task, so no other pass's write
 * falls between. The decoded samples move to a copy the first time others replace them.
 */
function createSampleWriter(
  gpu: Gpu,
  sensor: GPUTexture,
  blacks: readonly number[],
) {
  const device = gpu.gpu;
  const black = gpu.device.createBuffer({
    size: 16,
    usage: ["uniform", "copy_dst"],
  });
  black.write(new Float32Array(blacks));
  let decoded: Texture | undefined;
  return {
    /** The decoded samples, wherever they are. */
    decoded: () => decoded?.gpu ?? sensor,
    /** Writes `samples` in place of the decoded ones, or the decoded ones back. */
    write(samples?: Target) {
      if (!samples && !decoded) {
        return;
      }
      const encoder = device.createCommandEncoder();
      const size: [number, number] = [sensor.width, sensor.height];
      if (!decoded) {
        decoded = gpu.device.createTexture({
          size,
          format: sensor.format,
          usage: ["texture_binding", "copy_src", "copy_dst"],
        });
        encoder.copyTextureToTexture(
          { texture: sensor },
          { texture: decoded.gpu },
          size,
        );
      }
      if (samples) {
        const pipeline = blendPipeline(device);
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            { view: sensor.createView(), loadOp: "clear", storeOp: "store" },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(
          0,
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: decoded.gpu.createView() },
              { binding: 1, resource: samples.color.gpu.createView() },
              { binding: 2, resource: { buffer: black.gpu } },
            ],
          }),
        );
        pass.draw(3);
        pass.end();
      } else {
        encoder.copyTextureToTexture(
          { texture: decoded.gpu },
          { texture: sensor },
          size,
        );
      }
      device.queue.submit([encoder.finish()]);
    },
    dispose() {
      black.dispose();
      decoded?.dispose();
    },
  };
}

/**
 * The mosaic of a source the GPU demosaics from a 2 × 2 color filter of integer samples, and what
 * writes the samples its passes develop.
 */
function mosaicOf(gpu: Gpu, source: RawSource) {
  const { cfa, cfaSize = 2, demosaic, black, white } = source.metadata;
  if (
    !cfa ||
    cfaSize !== 2 ||
    demosaic !== "gpu" ||
    source.texture.format !== "r16uint"
  ) {
    return undefined;
  }
  const writer = createSampleWriter(
    gpu,
    source.texture,
    cfa.map((color) => black[color]),
  );
  const mosaic: Mosaic = {
    get samples() {
      return writer.decoded();
    },
    pattern: cfa,
    black,
    white,
  };
  return { mosaic, write: writer.write, dispose: writer.dispose };
}

/** Adapts package-owned sensor sources to OpenLight's document and renderer lifetimes. */
export async function decodeRaw(gpu: Gpu, file: File) {
  const source = await decoder(gpu).load(file);
  let original: Target | undefined;
  try {
    original = target(gpu, { size: source.size, format: "rgba16float" });
    const initial = source.createDevelopPass();
    try {
      initial.render({
        destination: original.color.gpu,
        calibration: source.calibration,
      });
    } finally {
      initial.dispose();
    }
    const { asShot } = source;
    const developed = original;
    const mosaic = mosaicOf(gpu, source);
    const raw: RawDevelopment = {
      asShot,
      mosaic: mosaic?.mosaic,
      createPass() {
        // The as-shot development of the decoded samples is the image the source keeps; another
        // balance, or other samples, get their own.
        let output: Target | undefined;
        const pass = source.createDevelopPass();
        let calibration = source.calibration;
        let replaced: Target | undefined;
        let dirty = true;
        return {
          async prepare(balance, samples) {
            const shot =
              balance.temperature === asShot.temperature &&
              balance.tint === asShot.tint;
            calibration = shot
              ? source.calibration
              : await source.calibrate(balance);
            replaced = samples;
            dirty = true;
          },
          render() {
            if (calibration === source.calibration && !replaced) {
              output?.color.dispose();
              output = undefined;
              return developed;
            }
            output ??= target(gpu, {
              size: source.size,
              format: "rgba16float",
            });
            if (dirty) {
              mosaic?.write(replaced);
              pass.render({ destination: output.color.gpu, calibration });
              dirty = false;
            }
            return output;
          },
          dispose() {
            pass.dispose();
            output?.color.dispose();
          },
        };
      },
      dispose() {
        mosaic?.dispose();
        source.dispose();
      },
    };
    return createImageSource(original, { raw });
  } catch (error) {
    original?.color.dispose();
    source.dispose();
    throw error;
  }
}
