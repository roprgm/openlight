import { compute, type Gpu, type Target } from "vgpu";
import shader from "./histogram.wgsl";

type Passes = {
  count: ReturnType<typeof compute>;
  finish: ReturnType<typeof compute>;
};

/** `GPUMapMode.READ`, which the page's WebGPU types leave out. */
const mapRead = 1;

/** The grid of texels the histogram counts, whatever the image's size: one vote per grid point, 16 × 16 per workgroup, and the size of a curve's input, so its texels are the votes. */
export const histogramGrid: readonly [number, number] = [512, 320];

/** The counting passes, compiled once per GPU and shared, since a histogram mounts with each curve shown. */
const shared = new WeakMap<Gpu, Passes>();

function histogramPasses(gpu: Gpu) {
  let passes = shared.get(gpu);
  if (!passes) {
    passes = {
      count: compute(gpu, shader, { entry: "count" }),
      finish: compute(gpu, shader, { entry: "finish" }),
    };
    shared.set(gpu, passes);
  }
  return passes;
}

/**
 * Counts an image into 256 bins per channel on the GPU and reads back normalized heights. Reads take
 * turns, so one mapped buffer serves them all, rather than one made and destroyed per frame, a churn
 * Safari tolerates poorly.
 */
export function createHistogram(gpu: Gpu) {
  const { count, finish } = histogramPasses(gpu);
  const bins = gpu.device.createBuffer({
    size: 3072,
    usage: ["storage", "copy_dst"],
  });
  const heights = gpu.device.createBuffer({
    size: 3072,
    usage: ["storage", "copy_src"],
  });
  const staging = gpu.device.createBuffer({
    size: 3072,
    usage: ["copy_dst", "map_read"],
  });
  const empty = new Uint32Array(768);
  let turn: Promise<unknown> = Promise.resolve();
  async function readHeights(
    image: () => Target | undefined,
    working: boolean,
    channels: 1 | 3,
  ) {
    const source = image();
    if (!source) {
      return undefined;
    }
    const params = { working: Number(working), channels, grid: histogramGrid };
    const bytes = channels * 1024;
    bins.write(empty);
    count
      .set({ source: source.color, bins, params })
      .dispatch(histogramGrid[0] / 16, histogramGrid[1] / 16);
    finish.set({ bins, heights, params }).dispatch(1);
    const encoder = gpu.gpu.createCommandEncoder();
    encoder.copyBufferToBuffer(heights.gpu, 0, staging.gpu, 0, bytes);
    gpu.gpu.queue.submit([encoder.finish()]);
    await staging.gpu.mapAsync(mapRead, 0, bytes);
    try {
      return new Float32Array(staging.gpu.getMappedRange(0, bytes).slice(0));
    } finally {
      staging.gpu.unmap();
    }
  }
  return {
    /** Heights of the image `image` returns when this read's turn comes, since an earlier one may have replaced it. */
    read(
      image: () => Target | undefined,
      working = false,
      channels: 1 | 3 = 3,
    ) {
      const read = turn.then(() => readHeights(image, working, channels));
      turn = read.catch(() => {});
      return read;
    },
    dispose() {
      bins.dispose();
      heights.dispose();
      staging.dispose();
    },
  };
}
