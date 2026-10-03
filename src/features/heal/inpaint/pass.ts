import type { RemovePatch } from "@/core/document";
import {
  type Composition,
  type FieldLattice,
  merge,
  node,
  type PatchInput,
  type RenderImage,
  sourceSize,
} from "@/core/renderer";
import { patchBounds } from "@/features/heal/model";
import {
  fieldLattice,
  type InpaintRegion,
  inpaintField,
  sampleInpaint,
} from ".";
import shader from "./blend.wgsl";

type FieldComposition = Pick<Composition, "field" | "keepField">;

/**
 * The field a patch shows: its own, or else one synthesized for its whole shape from the image below at
 * full resolution. A proxy shows none until then, since its reduced image would synthesize another.
 */
function patchField(
  source: RenderImage,
  coverage: PatchInput,
  region: InpaintRegion,
  patch: RemovePatch,
  name: string,
  composition: FieldComposition,
): { texels: RenderImage; lattice: FieldLattice } | undefined {
  const held = composition.field(patch);
  if (held || source.scale.some((scale) => scale > 1)) return held;
  const lattice = fieldLattice(region);
  const texels = inpaintField(source, coverage, lattice, `${name}/inpaint`);
  composition.keepField(patch, lattice, texels);
  return { texels, lattice };
}

export function removePatch(
  source: RenderImage,
  coverage: PatchInput,
  patch: RemovePatch,
  name: string,
  composition: FieldComposition,
) {
  const dimensions = sourceSize(source);
  const margin = patch.strokes.reduce((margin, stroke) => {
    if (stroke.mode === "erase") return margin;
    return Math.max(margin, stroke.size);
  }, 32);
  const region = patchBounds(patch.strokes, dimensions, margin);
  const field = patchField(source, coverage, region, patch, name, composition);
  if (!field) return source;
  const filled = sampleInpaint(
    source,
    field.texels,
    field.lattice,
    region,
    `${name}/sample`,
  );
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
