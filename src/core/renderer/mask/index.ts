import {
  hasPaint,
  isRangeMask,
  type MaskLayer,
  type MaskModifier,
  maskModifiers,
  type RangeMask,
} from "@/core/document";
import { parseColor } from "@/core/image/blend";
import { gradientParams, isGradient, operations } from "@/core/renderer/blend";
import { generate, merge, node, type RenderImage } from "@/core/renderer/node";
import { type PaintRaster, paintingSize } from "@/core/renderer/paint";
import combineShader from "./combine.wgsl";
import emptyShader from "./empty.wgsl";
import gradientShader from "./gradient.wgsl";
import rangeShader from "./range.wgsl";

type Size = readonly [number, number];

/** Where a render keeps what a mask's coverage made: pass instances to keep, and coverage to show. */
type CoverageOutputs = {
  retain: (instance: string) => void;
  show: (id: string, coverage: RenderImage) => void;
};

/** A mask's own coverage followed by the children that shape it, in stored order. */
function maskOps(layer: MaskLayer): readonly MaskModifier[] {
  return [
    { id: layer.id, mask: layer.mask, operation: "add", opacity: 1 },
    ...maskModifiers(layer),
  ];
}

/** Uniform fields for a range, its UI units scaled to 0..1. */
function rangeParams(mask: RangeMask) {
  if (mask.kind === "luminance-range") {
    const { low, high, smoothness } = mask;
    return { kind: 1, range: [low, high, smoothness, 0].map((v) => v / 100) };
  }
  if (mask.color === null) {
    return { kind: 0, range: [0, 0, 0, 0] };
  }
  return {
    kind: 2,
    range: [...parseColor(mask.color), mask.tolerance / 100],
  };
}

const linear: GPUSamplerDescriptor = {
  minFilter: "linear",
  magFilter: "linear",
};

/**
 * Mask coverage. A brush paints its coverage as a paint layer paints color, into a cached r8 raster
 * of `brushes`. A mask that only gradients shape needs no texture: the mix pass computes it. Any
 * other mask folds its children's coverage into its own in the render graph, one pass per child in
 * stored order, at the image's resolution when a range takes part, since a range follows the photo's
 * edges, and at the brushes' otherwise.
 */
export function createMaskCoverage(brushes: PaintRaster) {
  return {
    /**
     * Draws the brushes of a mask and of the children that shape it, painted or not, so an emptied
     * brush keeps its cleared raster while it lasts. `size` is the photo's.
     */
    update(layer: MaskLayer, size: Size) {
      for (const { id, mask } of maskOps(layer)) {
        if (mask.kind === "brush") {
          brushes.draw(id, mask, size);
        }
      }
    },
    /**
     * A mask's coverage over `below`, the image it applies to, or nothing when the mix pass computes
     * it or, as for a brush yet to paint with nothing added, it covers nothing. Read it once every mask
     * updated.
     */
    coverage(
      layer: MaskLayer,
      below: RenderImage,
      { retain, show }: CoverageOutputs,
    ): RenderImage | undefined {
      const ops = maskOps(layer);
      const [own, ...children] = ops;
      const ranged = ops.some(({ mask }) => isRangeMask(mask));
      const painted = ops.some(
        ({ mask }) => mask.kind === "brush" && hasPaint(mask),
      );
      if (isGradient(own.mask) && !ranged && !painted) {
        return undefined;
      }
      const size = ranged ? below.size : paintingSize(below.size);
      const scale = [
        (below.scale[0] * below.size[0]) / size[0],
        (below.scale[1] * below.size[1]) / size[1],
      ] as const;
      const output = { size, format: "r8unorm" as const, scale };
      /** One op's own coverage, or nothing for a brush yet to paint. */
      function covered(name: string, { id, mask }: MaskModifier) {
        if (mask.kind === "brush") {
          return hasPaint(mask) ? brushes.coverage(id) : undefined;
        }
        if (isGradient(mask)) {
          return generate(
            output,
            node(`${name}/gradient`, gradientShader, {
              set: { params: { ...gradientParams(mask), scale } },
            }),
          );
        }
        const range = merge(
          { image: below },
          node(`${name}/range`, rangeShader, {
            ...output,
            set: { params: rangeParams(mask) },
          }),
        );
        show(id, range);
        return range;
      }
      const name = (id: string) => {
        retain(`mask/${id}`);
        return `mask/${id}`;
      };
      let group = covered(name(layer.id), own);
      for (const child of children) {
        const coverage = covered(name(child.id), child);
        // A brush yet to paint takes no part, and a group that covers nothing yet only takes additions.
        if (!coverage || (!group && child.operation !== "add")) {
          continue;
        }
        const start =
          group ??
          generate(output, node(`${name(layer.id)}/empty`, emptyShader));
        group = merge(
          { group: start, coverage },
          node(`${name(child.id)}/combine`, combineShader, {
            ...output,
            samplers: { coverageSampler: linear },
            set: {
              params: {
                operation: operations[child.operation],
                opacity: child.opacity,
              },
            },
          }),
        );
      }
      if (group) {
        show(layer.id, group);
      }
      return group;
    },
    /** A brush's raster with its open stroke laid over it, if it has one. */
    brush: (id: string) => brushes.coverage(id),
    sweep: () => brushes.sweep(),
    inspect: () => brushes.inspect(),
    dispose: () => brushes.dispose(),
  };
}
