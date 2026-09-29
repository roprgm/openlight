import type { Blend } from "@/core/document";
import { blendIndex } from "@/core/image/blend";
import {
  merge,
  node,
  type RenderImage,
  type RenderInput,
} from "@/core/renderer";
import shader from "./paint.wgsl";

/** The image under a paint layer's raster; a layer that paints nothing leaves it as it is. */
export function paint(
  below: RenderImage,
  raster: RenderInput | undefined,
  blend: Blend,
  name: string,
) {
  if (!raster) {
    return below;
  }
  return merge(
    { source: below, paint: raster },
    node(name, shader, {
      samplers: { paintSampler: { minFilter: "linear", magFilter: "linear" } },
      set: { params: { blend: blendIndex(blend) } },
    }),
  );
}
