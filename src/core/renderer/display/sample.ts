import { effect, frame, type Gpu, type Target, target } from "vgpu";
import type { Point } from "@/core/image/frame";
import { weakMemo } from "@/lib/weak-memo";
import shader from "./sample.wgsl";

const sample = weakMemo((gpu: Gpu) => effect(gpu, shader));

/** Reads one displayed color and its brightness without copying the full image to the CPU. */
export async function sampleImage(gpu: Gpu, image: Target, point: Point) {
  const pixel = target(gpu, { size: [1, 1], format: "rgba16float" });
  try {
    frame(gpu, (frame) =>
      frame.pass(pixel, sample(gpu).set({ source: image.color, point })),
    );
    const values = await pixel.readFloats();
    const color = `#${[...values.slice(0, 3)]
      .map((value) =>
        Math.round(value * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
    return { color, luminance: values[3] };
  } finally {
    pixel.color.dispose();
  }
}
