import type { Gpu, Target, Timer } from "vgpu";
import type { BrushStroke } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { createRenderGraph, input, merge, node } from "@/core/renderer";
import { patchBounds } from "./model";
import shader from "./source.wgsl";

/** Boundary matching on a thumbnail. The painted interior never contributes to the score. */
function matchSource(
  pixels: Float32Array,
  size: readonly number[],
  dimensions: readonly number[],
  stroke: BrushStroke,
): Point {
  const { origin, extent } = patchBounds(stroke, dimensions);
  const [left, top] = origin;
  const [width, height] = extent;
  function color(x: number, y: number, channel: number) {
    const px = Math.max(
      0,
      Math.min(size[0] - 1, Math.floor((x * size[0]) / dimensions[0])),
    );
    const py = Math.max(
      0,
      Math.min(size[1] - 1, Math.floor((y * size[1]) / dimensions[1])),
    );
    return Math.log1p(Math.max(0, pixels[(py * size[0] + px) * 4 + channel]));
  }
  const border: Point[] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16;
    border.push(
      [left + width * t, top],
      [left + width * t, top + height],
      [left, top + height * t],
      [left + width, top + height * t],
    );
  }
  const step = Math.max(4, Math.min(width, height) / 3);
  const reach = Math.max(width, height) * 4;
  let best: Point | undefined;
  let score = Infinity;
  const count = Math.ceil(reach / step);
  for (let row = -count; row <= count; row++) {
    for (let column = -count; column <= count; column++) {
      const dx = Math.round(column * step);
      const dy = Math.round(row * step);
      const x = left + dx;
      const y = top + dy;
      if (
        x < 0 ||
        y < 0 ||
        x + width > dimensions[0] ||
        y + height > dimensions[1]
      ) {
        continue;
      }
      if (
        x < left + width &&
        x + width > left &&
        y < top + height &&
        y + height > top
      ) {
        continue;
      }
      let error = 0;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let squared = 0;
        for (const [px, py] of border) {
          const difference = color(px, py, c) - color(px + dx, py + dy, c);
          sum += difference;
          squared += difference * difference;
        }
        // Removing most of the mean allows the heal solver to match illumination.
        error += squared - (0.8 * sum * sum) / border.length;
      }
      // Similar nearby texture is less conspicuous and avoids surprising jumps
      // to a distant region when several candidates have comparable borders.
      error += (0.02 * (dx * dx + dy * dy)) / (reach * reach);
      if (error < score) {
        score = error;
        best = [dx, dy];
      }
    }
  }
  if (!best) {
    throw Error(
      "No clean source fits nearby. Use a smaller brush or Alt-click a source.",
    );
  }
  return best;
}

/** Owns one thumbnail pass, reused for each automatic source search. */
export function createHealSearch(gpu: Gpu, timer?: Timer) {
  const graph = createRenderGraph(gpu, timer);
  return {
    async find(
      image: Target,
      dimensions: readonly number[],
      stroke: BrushStroke,
    ) {
      const ratio = Math.min(1, 512 / Math.max(...image.size));
      const size: [number, number] = [
        Math.max(1, Math.round(image.size[0] * ratio)),
        Math.max(1, Math.round(image.size[1] * ratio)),
      ];
      const [thumbnail] = graph.render([
        merge(
          { source: input(image) },
          node("heal/search-thumbnail", shader, {
            size,
            set: { params: { size } },
            samplers: {
              linearSampler: { minFilter: "linear", magFilter: "linear" },
            },
          }),
        ),
      ]);
      return matchSource(
        await thumbnail.readFloats(),
        size,
        dimensions,
        stroke,
      );
    },
    inspect: graph.inspect,
    dispose: graph.dispose,
  };
}
