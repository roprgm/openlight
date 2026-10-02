import type { Point } from "@/core/image/frame";
import {
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
import prepareShader from "./prepare.wgsl";
import pyramidShader from "./pyramid.wgsl";
import reconstructShader from "./reconstruct.wgsl";

export type InpaintRegion = { origin: Point; extent: Point };
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
  let field = merge(
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

/** Multiscale, non-local synthesis. Every pixel operation stays on the GPU; no React or readback. */
export function inpaintField(
  source: RenderImage,
  patch: PatchInput,
  region: InpaintRegion,
  name: string,
): RenderNode {
  const dimensions = sourceSize(source);
  const factor = Math.max(...source.scale, Math.max(...region.extent) / 512);
  const size: Point = [
    Math.max(1, Math.ceil(region.extent[0] / factor)),
    Math.max(1, Math.ceil(region.extent[1] / factor)),
  ];
  const params = {
    ...region,
    dimensions,
    coverageOrigin: patch.origin,
    coverageSize: patch.coverage.size,
    grid: size,
  };
  const prepared = merge(
    { source, coverage: patch.coverage },
    node(`${name}/prepare`, prepareShader, { size, samplers, set: { params } }),
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
  let field: RenderNode | undefined;
  for (let level = pyramid.length - 1; level >= 0; level--) {
    field = solve(
      pyramid[level],
      descriptors[level],
      field,
      `${name}/level/${level}`,
    );
  }
  if (!field) throw Error("An inpainting pyramid is required.");
  return { ...field, name: `${name}/field` };
}

/** Sample whole source texels from a correspondence field, preserving original donor detail. */
export function sampleInpaint(
  source: RenderImage,
  field: RenderImage,
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
        },
      },
    }),
  );
}

/** Standalone synthesis and reconstruction; app composition can cache just the bounded field. */
export function inpaint(
  source: RenderImage,
  patch: PatchInput,
  region: InpaintRegion,
  name: string,
): RenderNode {
  return sampleInpaint(
    source,
    inpaintField(source, patch, region, name),
    region,
    `${name}/result`,
  );
}
