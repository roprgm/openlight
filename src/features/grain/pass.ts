import type { Grain } from "@/core/document";
import { merge, node, type RenderImage } from "@/core/renderer";
import shader from "./grain.wgsl";

/** Grain lies in source pixels, so a reduced proxy passes its scale to sample the same grain. */
export function grain(settings: Grain, name = "grain") {
  if (settings.amount === 0) {
    return;
  }
  return (image: RenderImage) =>
    merge(
      { source: image },
      node(name, shader, {
        set: { params: { ...settings, scale: image.scale } },
      }),
    );
}
