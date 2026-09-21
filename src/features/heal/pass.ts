import type { Target } from "vgpu";
import type { HealPatch } from "@/core/document";
import {
  type Composition,
  input,
  merge,
  node,
  type RenderImage,
  type RenderInput,
  sourceSize,
} from "@/core/renderer";
import shader from "./heal.wgsl";
import miganShader from "./migan.wgsl";
import { patchBounds } from "./model";

function healPatch(
  source: RenderImage,
  coverage: RenderInput,
  patch: Extract<HealPatch, { algorithm: "healing" }>,
  name: string,
) {
  if (patch.offset[0] === 0 && patch.offset[1] === 0) {
    return source;
  }
  const dimensions = sourceSize(source);
  const { origin, extent } = patchBounds(
    patch.stroke,
    dimensions,
    (patch.stroke.size * patch.feather) / 2,
  );
  const samplers = {
    linearSampler: { minFilter: "linear", magFilter: "linear" },
  } as const;
  const common = {
    origin,
    extent,
    dimensions,
    offset: patch.offset,
    feather: (patch.stroke.size * patch.feather) / 2,
    opacity: patch.opacity,
  };
  let correction = source;
  // Coarse-to-fine harmonic extension of the destination/donor log color ratio.
  // The correction is smooth; the donor retains its full-resolution texture.
  for (const resolution of [4, 8, 16, 32, 64, 128]) {
    const ratio = Math.min(1, resolution / Math.max(...extent));
    const size: [number, number] = [
      Math.max(2, Math.ceil(extent[0] * ratio)),
      Math.max(2, Math.ceil(extent[1] * ratio)),
    ];
    const params = { ...common, grid: size };
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
  return merge(
    { source, coverage, previous: correction },
    node(`${name}/blend`, shader, {
      samplers,
      set: { params: { ...common, grid: source.size, mode: 3 } },
    }),
  );
}

export function heal(
  source: RenderImage,
  patches: readonly HealPatch[],
  name: string,
  brush: Composition["brush"],
  inputId?: string,
  resolve?: (id: string) => Target,
) {
  let image = source;
  let inspected: RenderImage | undefined;
  for (const patch of patches) {
    if (patch.id === inputId) inspected = image;
    const id = `${name}/${patch.id}`;
    const coverage = brush(id, [patch.stroke]);
    if (patch.algorithm === "ai") {
      if (!patch.result) continue;
      if (!resolve) throw Error("AI image resource is unavailable.");
      const dimensions = sourceSize(image);
      const bounds = patchBounds(
        patch.stroke,
        dimensions,
        (patch.stroke.size * patch.feather) / 2,
      );
      image = merge(
        {
          source: image,
          coverage,
          result: input(resolve(patch.result.source)),
        },
        node(`${id}/migan`, miganShader, {
          samplers: {
            linearSampler: { minFilter: "linear", magFilter: "linear" },
          },
          set: {
            params: {
              origin: patch.result.origin,
              extent: patch.result.extent,
              maskOrigin: bounds.origin,
              maskExtent: bounds.extent,
              dimensions,
              feather: (patch.stroke.size * patch.feather) / 2,
              opacity: patch.opacity,
            },
          },
        }),
      );
      continue;
    }
    image = healPatch(image, coverage, patch, id);
  }
  return { image, input: inspected };
}
