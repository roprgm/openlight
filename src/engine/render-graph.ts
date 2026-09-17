import {
	type Effect,
	frame,
	type Gpu,
	type Target,
	type Timer,
	target,
} from "vgpu";

export type RenderImage = Target | RenderNode;
export type RenderNode = {
	readonly name: string;
	readonly inputs: readonly [RenderImage, ...RenderImage[]];
	readonly size: readonly [number, number];
	readonly format: GPUTextureFormat;
	readonly draw: (inputs: readonly Target[]) => Effect;
};

/** Inputs already exist when a node is built, so connections form an acyclic graph. */
export function renderNode(
	name: string,
	inputs: RenderNode["inputs"],
	draw: RenderNode["draw"],
	output: Pick<RenderNode, "size" | "format"> = inputs[0],
): RenderNode {
	return { name, inputs, draw, size: output.size, format: output.format };
}

/** Owns transient targets. Requested outputs remain readable until the next render or disposal. */
export function createRenderGraph(gpu: Gpu, clock?: Timer) {
	const targets: Target[] = [];
	let passes: string[] = [];
	let disposed = false;
	return {
		render(outputs: readonly RenderImage[]) {
			if (disposed) {
				throw Error("Render graph is closed.");
			}
			const uses = new Map<RenderImage, number>();
			const order: RenderNode[] = [];
			const live = new Set<Target>();
			const names = new Set<string>();
			function visit(image: RenderImage) {
				const count = uses.get(image) ?? 0;
				uses.set(image, count + 1);
				if (count) {
					return;
				}
				if (!("inputs" in image)) {
					live.add(image);
					return;
				}
				if (names.has(image.name)) {
					throw Error(`Duplicate render node: ${image.name}.`);
				}
				names.add(image.name);
				image.inputs.forEach(visit);
				order.push(image);
			}
			outputs.forEach(visit);
			const values = new Map<RenderNode, Target>();
			function resolve(image: RenderImage): Target {
				if (!("inputs" in image)) {
					return image;
				}
				const value = values.get(image);
				if (!value) {
					throw Error(`Unrendered node: ${image.name}.`);
				}
				return value;
			}
			const used = new Set<Target>();
			frame(gpu, (f) => {
				for (const node of order) {
					let output = targets.find(
						(image) =>
							!live.has(image) &&
							image.format === node.format &&
							image.size[0] === node.size[0] &&
							image.size[1] === node.size[1],
					);
					if (!output) {
						// Resize only targets not referenced by commands in this frame.
						output = targets.find(
							(image) =>
								!live.has(image) &&
								!used.has(image) &&
								image.format === node.format,
						);
						if (output) {
							output.resize(node.size);
						} else {
							output = target(gpu, { size: node.size, format: node.format });
							targets.push(output);
						}
					}
					live.add(output);
					used.add(output);
					f.pass(
						{ target: output, timer: clock?.span(node.name) },
						node.draw(node.inputs.map(resolve)),
					);
					values.set(node, output);
					for (const input of node.inputs) {
						const remaining = (uses.get(input) ?? 0) - 1;
						uses.set(input, remaining);
						if (!remaining && "inputs" in input) {
							live.delete(resolve(input));
						}
					}
				}
			});
			// Avoid retaining old crop sizes or the peak of a previously active effect.
			for (let i = targets.length - 1; i >= 0; i--) {
				if (!used.has(targets[i]) && !live.has(targets[i])) {
					targets[i].color.dispose();
					targets.splice(i, 1);
				}
			}
			passes = order.map((node) => node.name);
			return outputs.map(resolve);
		},
		inspect() {
			return {
				passes: [...passes],
				textures: targets.map(({ size, format }) => ({
					size: [...size],
					format,
				})),
			};
		},
		dispose() {
			disposed = true;
			for (const image of targets) {
				image.color.dispose();
			}
			targets.length = 0;
		},
	};
}
