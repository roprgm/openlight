import { compute, type Gpu, type Target } from "vgpu";
import shader from "./histogram.wgsl";

type Passes = {
  count: ReturnType<typeof compute>;
  finish: ReturnType<typeof compute>;
};

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

/** Counts an image into 256 bins per channel on the GPU and reads back normalized heights. */
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
  const empty = new Uint32Array(768);
  return {
    async read(image: Target, working = false, channels: 1 | 3 = 3) {
      const params = { working: Number(working), channels };
      bins.write(empty);
      count.set({ source: image.color, bins, params }).dispatch(32, 20);
      finish.set({ bins, heights, params }).dispatch(1);
      return new Float32Array(await heights.read(channels * 1024));
    },
    dispose() {
      bins.dispose();
      heights.dispose();
    },
  };
}
