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
import shader from "./heal.wgsl";
import { removePatch } from "./inpaint/pass";
import { patchBounds } from "./model";

type HealComposition = Pick<
  Composition,
  "patch" | "inputId" | "retain" | "cache"
>;

function healPatch(
  source: RenderImage,
  { coverage, origin: coverageOrigin }: PatchInput,
  patch: Extract<HealPatch, { mode: "heal" | "clone" }>,
  name: string,
) {
  const dimensions = sourceSize(source);
  const { origin, extent } = patchBounds(patch.stroke, dimensions, 0);
  const samplers = {
    linearSampler: { minFilter: "linear", magFilter: "linear" },
  } as const;
  const common = {
    origin,
    extent,
    dimensions,
    offset: patch.offset,
    coverageOrigin,
    coverageSize: coverage.size,
  };
  let correction = source;
  if (patch.mode === "heal") {
    // Coarse-to-fine harmonic extension of the destination/donor log color ratio.
    // The correction is smooth; the donor retains its full-resolution texture.
    for (const resolution of [4, 8, 16, 32, 64, 128]) {
      const ratio = Math.min(1, resolution / Math.max(...extent));
      const size: [number, number] = [
        Math.max(2, Math.ceil(extent[0] * ratio)),
        Math.max(2, Math.ceil(extent[1] * ratio)),
      ];
      const params = { ...common, grid: size, feather: 0, opacity: 1 };
      correction = merge(
        { source, coverage, previous: correction },
        node(`${name}/${resolution}/seed`, shader, {
          size,
          samplers,
          set: { params: { ...params, mode: resolution === 4 ? 0 : 1 } },
        }),
      );
      const iterations = resolution === 4 ? 32 : 8;
      for (let i = 0; i < iterations; i++) {
        correction = merge(
          { source, coverage, previous: correction },
          node(`${name}/${resolution}/relax-${i}`, shader, {
            instance: `${name}/${resolution}/relax`,
            size,
            samplers,
            set: { params: { ...params, mode: 2 } },
          }),
        );
      }
      if (resolution >= Math.max(...extent)) {
        break;
      }
    }
  }
  return merge(
    { source, coverage, previous: correction },
    node(`${name}/blend`, shader, {
      samplers,
      set: {
        params: {
          ...common,
          grid: source.size,
          mode: patch.mode === "clone" ? 4 : 3,
          feather: (patch.stroke.size * patch.feather) / 2,
          opacity: patch.opacity,
        },
      },
    }),
  );
}

export function heal(
  source: RenderImage,
  patches: readonly HealPatch[],
  name: string,
  composition: HealComposition,
  dependencies: readonly CacheKey[],
) {
  let image = source;
  let inspected: RenderImage | undefined;
  let content = dependencies;
  for (const patch of patches) {
    if (patch.id === composition.inputId) inspected = image;
    const id = `${name}/${patch.id}`;
    if (
      patch.mode !== "remove" &&
      patch.offset[0] === 0 &&
      patch.offset[1] === 0
    )
      continue;
    const coverage = composition.patch(id, patch.stroke);
    composition.retain(id);
    if (patch.mode === "remove") {
      image = removePatch(
        image,
        coverage,
        patch,
        id,
        composition.cache,
        content,
      );
    } else {
      image = healPatch(image, coverage, patch, id);
    }
    content = [...content, patch];
  }
  return { image, input: inspected };
}
