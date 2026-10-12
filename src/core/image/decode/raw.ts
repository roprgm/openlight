import { createRawDecoder } from "raw-webgpu";
import { type Gpu, type Target, target } from "vgpu";
import { createImageSource, type RawDevelopment } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";

/** One decoder per GPU, released with its device. */
const decoder = weakMemo((gpu: Gpu) => createRawDecoder(gpu.gpu));

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
    const raw: RawDevelopment = {
      asShot,
      createPass() {
        // The as-shot development is the image the source keeps; another balance gets its own.
        let output: Target | undefined;
        const pass = source.createDevelopPass();
        let calibration = source.calibration;
        let dirty = true;
        return {
          async prepare(balance) {
            const shot =
              balance.temperature === asShot.temperature &&
              balance.tint === asShot.tint;
            calibration = shot
              ? source.calibration
              : await source.calibrate(balance);
            dirty = true;
          },
          render() {
            if (calibration === source.calibration) {
              output?.color.dispose();
              output = undefined;
              return developed;
            }
            output ??= target(gpu, {
              size: source.size,
              format: "rgba16float",
            });
            if (dirty) {
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
      dispose: source.dispose,
    };
    return createImageSource(original, { raw });
  } catch (error) {
    original?.color.dispose();
    source.dispose();
    throw error;
  }
}
