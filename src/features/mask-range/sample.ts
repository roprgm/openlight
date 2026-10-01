import { compute, type Gpu, type Target } from "vgpu";
import type { Point } from "@/core/image/frame";
import { weakMemo } from "@/lib/weak-memo";
import shader from "./sample.wgsl";

const samplePass = weakMemo((gpu: Gpu) =>
  compute(gpu, shader, { entry: "sample" }),
);

function hex(channel: number) {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, "0");
}

/**
 * The color around `point`, a fraction of the image's width and height, as the screen shows it in
 * `#rrggbb`; nothing for a point outside the image.
 */
export async function sampleColor(gpu: Gpu, image: Target, point: Point) {
  const color = gpu.device.createBuffer({
    size: 16,
    usage: ["storage", "copy_src"],
  });
  try {
    samplePass(gpu)
      .set({ source: image.color, params: { point }, color })
      .dispatch(1);
    const [r, g, b, count] = new Float32Array(await color.read(16));
    return count > 0 ? `#${hex(r)}${hex(g)}${hex(b)}` : undefined;
  } finally {
    color.dispose();
  }
}
