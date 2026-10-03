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

/** The image placed by the frame; identity geometry preserves the input. A proxy keeps its reduction. */
export function transformImage(source: RenderImage, geometry: ImageFrame) {
  const initial = frameValues(imageFrame(sourceSize(source)));
  if (frameValues(geometry).every((value, i) => value === initial[i])) {
    return source;
  }
  return merge(
    { source },
    node("transform", shader, {
      set: { transform: frameTransform(geometry, sourceSize(source)) },
      samplers: {
        sourceSampler: { magFilter: "linear", minFilter: "linear" },
      },
      size: [
        Math.max(1, Math.round(geometry.size[0] / source.scale[0])),
        Math.max(1, Math.round(geometry.size[1] / source.scale[1])),
      ],
    }),
  );
}
