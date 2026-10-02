import type { HealPatch } from "@/core/document";
import {
  type CacheKey,
  type Composition,
  merge,
  node,
  type PatchInput,
  type RenderImage,
  sourceSize,
} from "@/core/renderer";
import { patchBounds } from "@/features/heal/model";
import { inpaintField, sampleInpaint } from ".";
import shader from "./blend.wgsl";

export function removePatch(
  source: RenderImage,
  coverage: PatchInput,
  patch: Extract<HealPatch, { mode: "remove" }>,
  name: string,
  cache: Composition["cache"],
  dependencies: readonly CacheKey[],
) {
  const dimensions = sourceSize(source);
  const margin = patch.strokes.reduce((margin, stroke) => {
    if (stroke.mode === "erase") return margin;
    return Math.max(margin, stroke.size);
  }, 32);
  const region = patchBounds(patch.strokes, dimensions, margin);
  const field = cache(
    inpaintField(source, coverage, region, `${name}/inpaint`),
    [...dependencies, patch.strokes],
  );
  const filled = sampleInpaint(source, field, region, `${name}/sample`);
  return merge(
    { source, coverage: coverage.coverage, filled },
    node(`${name}/blend`, shader, {
      samplers: {
        linearSampler: { minFilter: "linear", magFilter: "linear" },
      },
      set: {
        params: {
          ...region,
          dimensions,
          grid: source.size,
          coverageOrigin: coverage.origin,
          coverageSize: coverage.coverage.size,
          feather: (patch.strokes[0].size * patch.feather) / 2,
          opacity: patch.opacity,
        },
      },
    }),
  );
}
