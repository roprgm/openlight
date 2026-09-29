import type { Blend } from "@/core/document";
import { blendIndex } from "@/core/image/blend";
import {
  input,
  merge,
  node,
  type Raster,
  type RenderImage,
} from "@/core/renderer";
import shader from "./paint.wgsl";

/** The image under a paint layer's raster; a layer that paints nothing leaves it as it is. */
export function paint(
  below: RenderImage,
  raster: Raster | undefined,
  blend: Blend,
  name: string,
) {
  if (!raster) {
    return below;
  }
  return merge(
    { source: below, paint: input(raster.target) },
    node(name, shader, {
      samplers: { paintSampler: { minFilter: "linear", magFilter: "linear" } },
      set: {
        params: {
          blend: blendIndex(blend),
          origin: raster.origin,
          scale: below.scale,
        },
      },
    }),
  );
}
