import { compute, type Gpu, type Target } from "vgpu";
import shader from "./histogram.wgsl";

/** Counts an image into 256 bins per channel on the GPU and reads back normalized heights. */
export function createHistogram(gpu: Gpu) {
  const bins = gpu.device.createBuffer({
    size: 3072,
    usage: ["storage", "copy_dst"],
  });
  const heights = gpu.device.createBuffer({
    size: 3072,
    usage: ["storage", "copy_src"],
  });
  const count = compute(gpu, shader, { entry: "count", set: { bins } });
  const finish = compute(gpu, shader, {
    entry: "finish",
    set: { bins, heights },
  });
  const empty = new Uint32Array(768);
  return {
    async read(image: Target, working = false, channels: 1 | 3 = 3) {
      const params = { working: Number(working), channels };
      bins.write(empty);
      count.set({ source: image.color, params }).dispatch(32, 20);
      finish.set({ params }).dispatch(1);
      return new Float32Array(await heights.read(channels * 1024));
    },
    dispose() {
      bins.dispose();
      heights.dispose();
    },
  };
}
