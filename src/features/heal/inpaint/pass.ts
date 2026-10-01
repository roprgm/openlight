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
  const region = patchBounds(
    patch.stroke,
    dimensions,
    Math.max(32, patch.stroke.size),
  );
  const field = cache(
    inpaintField(source, coverage, region, `${name}/inpaint`),
    [...dependencies, patch.stroke],
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
          feather: (patch.stroke.size * patch.feather) / 2,
          opacity: patch.opacity,
        },
      },
    }),
  );
}
