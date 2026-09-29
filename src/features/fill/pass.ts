import type { Fill } from "@/core/document";
import { blendIndex, parseColor } from "@/core/image/blend";
import { node } from "@/core/renderer";
import shader from "./fill.wgsl";

export function fill(settings: Fill, name = "fill") {
  return node(name, shader, {
    set: {
      params: {
        color: parseColor(settings.color),
        blend: blendIndex(settings.blend),
      },
    },
  });
}
