import {
  frameTransform,
  frameValues,
  type ImageFrame,
  imageFrame,
} from "@/core/image/frame";
import {
  merge,
  node,
  type RenderImage,
  sourceSize,
} from "@/core/renderer/node";
import shader from "./frame.wgsl";

/** Equal inputs share a transform node; identity geometry preserves the input. A proxy keeps its reduction. */
export function transformImages(
  sources: readonly RenderImage[],
  geometry: ImageFrame,
) {
  const initial = frameValues(imageFrame(sourceSize(sources[0])));
  if (frameValues(geometry).every((value, i) => value === initial[i])) {
    return sources;
  }
  const outputs = new Map<RenderImage, RenderImage>();
  return sources.map((input, i) => {
    const existing = outputs.get(input);
    if (existing) {
      return existing;
    }
    const output = merge(
      { source: input },
      node(`transform/${i}`, shader, {
        set: { transform: frameTransform(geometry, sourceSize(input)) },
        samplers: {
          sourceSampler: { magFilter: "linear", minFilter: "linear" },
        },
        size: [
          Math.max(1, Math.round(geometry.size[0] / input.scale[0])),
          Math.max(1, Math.round(geometry.size[1] / input.scale[1])),
        ],
      }),
    );
    outputs.set(input, output);
    return output;
  });
}
