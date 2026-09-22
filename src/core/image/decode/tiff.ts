import { effect, frame, type Gpu, type Target, target } from "vgpu";
import { createImageSource } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import shader from "./tiff.wgsl";

/** One transfer pass per GPU, released with its device. */
const transfer = weakMemo((gpu: Gpu) => effect(gpu, shader));

/** Transfers package-owned pixels into the editor's owned vgpu target, entirely on GPU. */
export async function decodeTiff(gpu: Gpu, file: File) {
  const { decodeTiff } = await import("raw-webgpu");
  const decoded = await decodeTiff(gpu.gpu, file);
  let image: Target | undefined;
  try {
    const output = target(gpu, { size: decoded.size, format: "rgba16float" });
    image = output;
    frame(gpu, (frame) =>
      frame.pass(
        output,
        transfer(gpu).set({ source: decoded.texture.createView() }),
      ),
    );
    return createImageSource(image);
  } catch (error) {
    image?.color.dispose();
    throw error;
  } finally {
    decoded.dispose();
  }
}
