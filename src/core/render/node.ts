import type { EffectOptions, ShaderSource, Target } from "vgpu";

export type RenderImage = Target | RenderNode;
type NodeOptions = {
	readonly inputs: Readonly<Record<string, RenderImage>>;
	readonly set?: EffectOptions["set"];
	readonly samplers?: Readonly<Record<string, GPUSamplerDescriptor>>;
	readonly storage?: Readonly<Record<string, Float32Array<ArrayBuffer>>>;
	readonly size?: readonly [number, number];
	readonly format?: GPUTextureFormat;
};
export type RenderNode = NodeOptions & {
	readonly name: string;
	readonly shader: string | ShaderSource;
	readonly size: readonly [number, number];
	readonly format: GPUTextureFormat;
};

/** Inputs already exist when a node is built, so connections form an acyclic graph. */
export function renderNode(
	name: string,
	shader: RenderNode["shader"],
	options: NodeOptions,
): RenderNode {
	const input = Object.values(options.inputs)[0];
	if (!input) {
		throw Error(`Render node ${name} needs an input.`);
	}
	return {
		...options,
		name,
		shader,
		size: options.size ?? input.size,
		format: options.format ?? input.format,
	};
}
