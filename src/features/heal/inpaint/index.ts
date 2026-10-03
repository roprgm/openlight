import type { Point } from "@/core/image/frame";
import {
  type FieldLattice,
  merge,
  node,
  type PatchInput,
  type RenderImage,
  type RenderNode,
  sourceSize,
} from "@/core/renderer";
import featuresShader from "./features.wgsl";
import finishShader from "./finish.wgsl";
import matchShader from "./match.wgsl";
import nearestShader from "./nearest.wgsl";
import offsetsShader from "./offsets.wgsl";
import prepareShader from "./prepare.wgsl";
import pyramidShader from "./pyramid.wgsl";
import reconstructShader from "./reconstruct.wgsl";

export type InpaintRegion = { origin: Point; extent: Point };
/** Texels along a field's longer side at most; a larger region takes larger texels. */
export const fieldLongSide = 512;
const samplers = {
  linearSampler: { minFilter: "linear", magFilter: "linear" },
} as const;

function nearest(features: RenderImage, name: string) {
  let image = merge(
    { features, previous: features },
    node(`${name}/nearest/seed`, nearestShader, {
      format: "rgba32float",
      set: { params: { jump: 0 } },
    }),
  );
  for (
    let jump = 2 ** Math.ceil(Math.log2(Math.max(...features.size)));
    jump >= 1;
    jump /= 2
  ) {
    image = merge(
      { features, previous: image },
      node(`${name}/nearest/${jump}`, nearestShader, {
        format: "rgba32float",
        set: { params: { jump } },
      }),
    );
  }
  return image;
}

function reconstruct(
  source: RenderImage,
  field: RenderImage,
  name: string,
  instance: string,
) {
  return merge(
    { source, field },
    node(name, reconstructShader, {
      instance,
    }),
  );
}

function solve(
  source: RenderImage,
  features: RenderImage,
  coarse: RenderImage | undefined,
  name: string,
) {
  const closest = nearest(features, name);
  const params = {
    jump: 1,
    iteration: 0,
    initialize: 1,
    coarse: Number(Boolean(coarse)),
    confidence: 0,
    radius: coarse ? 1e10 : 4,
  };
  let iteration = 0;
  let field: RenderImage = merge(
    {
      source,
      features,
      nearest: closest,
      current: source,
      field: coarse ?? closest,
    },
    node(`${name}/initialize`, matchShader, {
      format: "rgba32float",
      set: { params },
    }),
  );
  let current = reconstruct(
    source,
    field,
    `${name}/iteration/seed`,
    `${name}/reconstruct`,
  );
  if (!coarse) {
    // Grow a reliable initialization inward before the global refinements.
    for (let radius = 7; radius <= Math.max(...source.size) + 3; radius += 3) {
      field = merge(
        { source, features, nearest: closest, current, field },
        node(`${name}/seed/${radius}`, matchShader, {
          format: "rgba32float",
          set: {
            params: {
              ...params,
              initialize: 0,
              radius,
              confidence: 1,
              iteration: ++iteration,
            },
          },
        }),
      );
      current = reconstruct(
        source,
        field,
        `${name}/seed/${radius}/vote`,
        `${name}/reconstruct`,
      );
    }
  }
  const iterations = coarse ? 4 : 6;
  for (let refinement = 0; refinement < iterations; refinement++) {
    for (const jump of [8, 4, 2, 1]) {
      field = merge(
        { source, features, nearest: closest, current, field },
        node(`${name}/iteration/${refinement}/match/${jump}`, matchShader, {
          format: "rgba32float",
          set: {
            params: {
              ...params,
              initialize: 0,
              radius: 1e10,
              iteration: ++iteration,
              jump,
              confidence: 0.2 + 0.8 * (refinement / iterations),
            },
          },
        }),
      );
    }
    current = reconstruct(
      source,
      field,
      `${name}/iteration/${refinement}/vote`,
      `${name}/reconstruct`,
    );
  }
  return field;
}

/** The texels a field over `bounds` takes. */
export function fieldLattice(bounds: InpaintRegion): FieldLattice {
  const scale = Math.max(1, Math.max(...bounds.extent) / fieldLongSide);
  return {
    origin: bounds.origin,
    scale,
    size: [
      Math.max(1, Math.ceil(bounds.extent[0] / scale)),
      Math.max(1, Math.ceil(bounds.extent[1] / scale)),
    ],
  };
}

/**
 * Multiscale, non-local synthesis of each hole texel's offset to its donor, in texels, at full
 * resolution. Every pixel operation stays on the GPU; no React or readback.
 */
export function inpaintField(
  source: RenderImage,
  patch: PatchInput,
  lattice: FieldLattice,
  name: string,
): RenderNode {
  const params = {
    origin: lattice.origin,
    scale: lattice.scale,
    dimensions: sourceSize(source),
    coverageOrigin: patch.origin,
    coverageSize: patch.coverage.size,
  };
  const prepared = merge(
    { source, coverage: patch.coverage },
    node(`${name}/prepare`, prepareShader, {
      size: lattice.size,
      samplers,
      set: { params },
    }),
  );
  const pyramid: RenderImage[] = [prepared];
  while (Math.max(...pyramid[pyramid.length - 1].size) > 32) {
    const previous = pyramid[pyramid.length - 1];
    const size: Point = [
      Math.ceil(previous.size[0] / 2),
      Math.ceil(previous.size[1] / 2),
    ];
    pyramid.push(
      merge(
        { source: previous },
        node(`${name}/pyramid/${pyramid.length}`, pyramidShader, { size }),
      ),
    );
  }
  const descriptors: RenderImage[] = [];
  for (const [level, source] of pyramid.entries()) {
    descriptors.push(
      merge(
        { source, fine: descriptors[level - 1] ?? source },
        node(`${name}/level/${level}/features`, featuresShader, {
          set: { params: { coarse: Number(level > 0) } },
        }),
      ),
    );
  }
  let field: RenderImage | undefined;
  for (let level = pyramid.length - 1; level >= 0; level--) {
    field = solve(
      pyramid[level],
      descriptors[level],
      field,
      `${name}/level/${level}`,
    );
  }
  if (!field) throw Error("An inpainting pyramid is required.");
  return merge(
    { source: prepared, field },
    node(`${name}/offsets`, offsetsShader, { format: "rg16float" }),
  );
}

/** Sample whole source texels at a field's offsets, preserving original donor detail. */
export function sampleInpaint(
  source: RenderImage,
  field: RenderImage,
  lattice: FieldLattice,
  region: InpaintRegion,
  name: string,
): RenderNode {
  const dimensions = sourceSize(source);
  const outputSize: Point = [
    Math.ceil(region.extent[0] / source.scale[0]),
    Math.ceil(region.extent[1] / source.scale[1]),
  ];
  return merge(
    { source, field },
    node(name, finishShader, {
      size: outputSize,
      samplers,
      set: {
        params: {
          ...region,
          dimensions,
          grid: outputSize,
          texel: source.scale,
          fieldOrigin: lattice.origin,
          fieldScale: lattice.scale,
        },
      },
    }),
  );
}

/** Standalone synthesis and sampling; app composition keeps the field to sample it again. */
export function inpaint(
  source: RenderImage,
  patch: PatchInput,
  region: InpaintRegion,
  name: string,
): RenderNode {
  const lattice = fieldLattice(region);
  return sampleInpaint(
    source,
    inpaintField(source, patch, lattice, name),
    lattice,
    region,
    `${name}/result`,
  );
}
