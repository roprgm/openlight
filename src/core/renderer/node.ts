import type { EffectOptions, ShaderSource, Target } from "vgpu";

type NodeOptions = {
  /** Shares state across passes whose shader and non-input bindings are identical. */
  readonly instance?: string;
  readonly set?: EffectOptions["set"];
  readonly samplers?: Readonly<Record<string, GPUSamplerDescriptor>>;
  readonly storage?: Readonly<Record<string, Float32Array<ArrayBuffer>>>;
  readonly size?: readonly [number, number];
  readonly format?: GPUTextureFormat;
};
export type NodeDefinition = NodeOptions & {
  readonly name: string;
  readonly shader: string | ShaderSource;
};
/** Source pixels per texel on each axis; a proxy is reduced, so its geometry scales up. */
export type Scale = readonly [number, number];
export type RenderInput = {
  readonly target: Target;
  readonly size: readonly [number, number];
  readonly format: GPUTextureFormat;
  readonly scale: Scale;
};
export type RenderNode = NodeDefinition & {
  readonly inputs: Readonly<Record<string, RenderImage>>;
  readonly size: readonly [number, number];
  readonly format: GPUTextureFormat;
  readonly scale: Scale;
};
export type RenderImage = RenderInput | RenderNode;
export type RenderStep =
  | NodeDefinition
  | ((image: RenderImage) => RenderImage)
  | undefined;

/** Imports a caller-owned texture without copying or allocating GPU resources. */
export function input(target: Target, scale: Scale = [1, 1]): RenderInput {
  return { target, size: target.size, format: target.format, scale };
}

/** The source dimensions an image stands for, whatever its texel count. */
export function sourceSize(image: RenderImage): [number, number] {
  return [
    Math.round(image.size[0] * image.scale[0]),
    Math.round(image.size[1] * image.scale[1]),
  ];
}

export function node(
  name: string,
  shader: NodeDefinition["shader"],
  options: NodeOptions = {},
): NodeDefinition {
  return { ...options, name, shader };
}

/** Connects named shader inputs; the shader defines how to combine them. */
export function merge(
  inputs: RenderNode["inputs"],
  definition: NodeDefinition,
): RenderNode {
  const first = Object.values(inputs)[0];
  if (!first) {
    throw Error(`Render node ${definition.name} needs an input.`);
  }
  return {
    ...definition,
    inputs,
    size: definition.size ?? first.size,
    format: definition.format ?? first.format,
    scale: first.scale,
  };
}

/** Connects source → output in order; an omitted step is a bypass. */
export function pipeline(
  source: RenderImage,
  steps: readonly RenderStep[],
): RenderImage {
  return steps.reduce<RenderImage>((image, step) => {
    if (!step) {
      return image;
    }
    if (typeof step === "function") {
      return step(image);
    }
    return merge({ source: image }, step);
  }, source);
}

/** Branches share their input; this does not copy textures. */
export function split(
  source: RenderImage,
  branches: readonly (readonly RenderStep[])[],
) {
  return branches.map((steps) => pipeline(source, steps));
}
