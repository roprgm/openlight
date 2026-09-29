import type { Blend } from "@/core/document";
import { blendIndex, parseColor } from "@/core/image/blend";
import {
  merge,
  node,
  type PaintInput,
  type RenderImage,
} from "@/core/renderer";
import shader from "./paint.wgsl";

const strokeModes = { paint: 1, erase: 2 };

/** The image under a paint layer's raster and open stroke; a layer that paints nothing leaves it as it is. */
export function paint(
  below: RenderImage,
  painted: PaintInput | undefined,
  blend: Blend,
  name: string,
) {
  if (!painted) {
    return below;
  }
  const { raster, buffer, stroke } = painted;
  return merge(
    { source: below, paint: raster, stroke: buffer },
    node(name, shader, {
      samplers: { paintSampler: { minFilter: "linear", magFilter: "linear" } },
      set: {
        params: {
          blend: blendIndex(blend),
          stroke: stroke ? strokeModes[stroke.mode] : 0,
          strokeColor: parseColor(stroke?.color ?? "#000000"),
        },
      },
    }),
  );
}
