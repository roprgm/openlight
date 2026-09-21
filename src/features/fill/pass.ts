import type { Fill } from "@/core/document";
import { node } from "@/core/renderer";
import shader from "./fill.wgsl";
import { blends, parseColor } from "./model";

export function fill(settings: Fill, name = "fill") {
  return node(name, shader, {
    set: {
      params: {
        color: parseColor(settings.color),
        blend: blends.findIndex(([blend]) => blend === settings.blend),
      },
    },
  });
}
