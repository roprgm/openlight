import { createRawDecoder, type RawSource } from "raw-webgpu";
import { type Gpu, type Target, type Texture, target } from "vgpu";
import {
  createImageSource,
  type Mosaic,
  type RawDevelopment,
  type SampleBlend,
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
 * falls between. The decoded samples move to a copy the first time a blend replaces them.
 */
function createSampleWriter(
  gpu: Gpu,
  sensor: GPUTexture,
  blacks: readonly number[],
) {
  const device = gpu.gpu;
  // The blend's amount, then each 2 × 2 position's black level.
  const blendValues = new Float32Array(8);
  blendValues.set(blacks, 4);
  const uniforms = gpu.device.createBuffer({
    size: blendValues.byteLength,
    usage: ["uniform", "copy_dst"],
  });
  let decoded: Texture | undefined;
  let held: SampleBlend | undefined;
  return {
    /** The decoded samples, wherever they are. */
    decoded: () => decoded?.gpu ?? sensor,
    write(blend?: SampleBlend) {
      if (blend?.samples === held?.samples && blend?.amount === held?.amount) {
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
      if (blend) {
        blendValues[0] = blend.amount;
        uniforms.write(blendValues);
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
              { binding: 1, resource: blend.samples.color.gpu.createView() },
              { binding: 2, resource: { buffer: uniforms.gpu } },
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
      held = blend;
    },
    dispose() {
      uniforms.dispose();
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
  const closed = new AbortController();
  let denoised: Promise<Target> | undefined;
  const mosaic: Mosaic = {
    get samples() {
      return writer.decoded();
    },
    pattern: cfa,
    black,
    white,
    denoised(reduce) {
      denoised ??= reduce(mosaic, closed.signal).catch((error) => {
        denoised = undefined;
        throw error;
      });
      return denoised;
    },
  };
  return {
    mosaic,
    write: writer.write,
    dispose() {
      closed.abort(Error("RAW source is closed."));
      void denoised?.then(
        (samples) => samples.color.dispose(),
        () => {},
      );
      writer.dispose();
    },
  };
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
        // balance, or a blend, gets its own.
        let output: Target | undefined;
        const pass = source.createDevelopPass();
        let calibration = source.calibration;
        let blend: SampleBlend | undefined;
        let dirty = true;
        return {
          async prepare(balance, samples) {
            const shot =
              balance.temperature === asShot.temperature &&
              balance.tint === asShot.tint;
            calibration = shot
              ? source.calibration
              : await source.calibrate(balance);
            blend = samples?.amount ? samples : undefined;
            dirty = true;
          },
          render() {
            if (calibration === source.calibration && !blend) {
              output?.color.dispose();
              output = undefined;
              return developed;
            }
            output ??= target(gpu, {
              size: source.size,
              format: "rgba16float",
            });
            if (dirty) {
              mosaic?.write(blend);
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
