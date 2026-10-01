import { compute, type Gpu, type Target } from "vgpu";
import type { Point } from "@/core/image/frame";
import { weakMemo } from "@/lib/weak-memo";
import shader from "./color-sample.wgsl";

/** `GPUMapMode.READ`, which the page's WebGPU types leave out. */
const mapRead = 1;
/** One color and the count of texels it averages. */
const bytes = 16;

const samplePass = weakMemo((gpu: Gpu) =>
  compute(gpu, shader, { entry: "sample" }),
);

function hex(channel: number) {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, "0");
}

/**
 * Reads colors from images on the GPU, which averages the texels around a point so only 16 bytes
 * cross to the CPU, through one buffer the pass writes and one the CPU maps, so sampling allocates
 * nothing. Reads take turns, and one still waiting when a newer one comes is dropped, so a pointer
 * that moves faster than reads complete gets its latest color.
 */
export function createColorSampler(gpu: Gpu) {
  const color = gpu.device.createBuffer({
    size: bytes,
    usage: ["storage", "copy_src"],
  });
  const staging = gpu.device.createBuffer({
    size: bytes,
    usage: ["copy_dst", "map_read"],
  });
  let turn: Promise<unknown> = Promise.resolve();
  let latest = 0;
  async function read(image: Target, point: Point) {
    samplePass(gpu)
      .set({ source: image.color, params: { point }, color })
      .dispatch(1);
    const encoder = gpu.gpu.createCommandEncoder();
    encoder.copyBufferToBuffer(color.gpu, 0, staging.gpu, 0, bytes);
    gpu.gpu.queue.submit([encoder.finish()]);
    await staging.gpu.mapAsync(mapRead, 0, bytes);
    try {
      const [r, g, b, count] = new Float32Array(
        staging.gpu.getMappedRange(0, bytes).slice(0),
      );
      return count > 0 ? `#${hex(r)}${hex(g)}${hex(b)}` : undefined;
    } finally {
      staging.gpu.unmap();
    }
  }
  return {
    /**
     * The color around `point`, a fraction of the width and height of the image `image` returns when
     * this read's turn comes, as the screen shows it in `#rrggbb`; nothing outside the image, without
     * one, or for a read a newer one replaced.
     */
    sample(image: () => Target | undefined, point: Point) {
      const request = ++latest;
      const result = turn.then(() => {
        const source = image();
        return request === latest && source ? read(source, point) : undefined;
      });
      turn = result.catch(() => {});
      return result;
    },
    dispose() {
      latest++;
      // A read in flight keeps its buffers until it finishes.
      void turn.then(() => {
        color.dispose();
        staging.dispose();
      });
    },
  };
}
