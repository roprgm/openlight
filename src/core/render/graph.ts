import {
	type Buffer,
	type Effect,
	effect,
	frame,
	type Gpu,
	sampler,
	type Target,
	type Timer,
	target,
} from "vgpu";
import type { RenderImage, RenderNode } from "./node";

/** Owns effects, storage buffers, and transient targets for one renderer. */
export function createRenderGraph(gpu: Gpu, clock?: Timer) {
	const targets: Target[] = [];
	const effects = new Map<
		string,
		{
			shader: RenderNode["shader"];
			apply: Effect;
			buffers: Map<string, Buffer>;
		}
	>();
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
				Object.values(image.inputs).forEach(visit);
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
					let pass = effects.get(node.name);
					if (!pass) {
						pass = {
							shader: node.shader,
							apply: effect(gpu, node.shader, {
								label: node.name,
								set: Object.fromEntries(
									Object.entries(node.samplers ?? {}).map(
										([name, descriptor]) => [name, sampler(gpu, descriptor)],
									),
								),
							}),
							buffers: new Map(),
						};
						effects.set(node.name, pass);
					}
					if (pass.shader !== node.shader) {
						throw Error(
							`Render node ${node.name} changed shader; use a new name.`,
						);
					}
					for (const [name, data] of Object.entries(node.storage ?? {})) {
						let buffer = pass.buffers.get(name);
						if (!buffer || buffer.options.size !== data.byteLength) {
							buffer?.dispose();
							buffer = gpu.device.createBuffer({
								size: data.byteLength,
								usage: ["storage", "copy_dst"],
							});
							pass.buffers.set(name, buffer);
							pass.apply.set({ [name]: buffer });
						}
						buffer.write(data);
					}
					pass.apply.set({
						...node.set,
						...Object.fromEntries(
							Object.entries(node.inputs).map(([name, image]) => [
								name,
								resolve(image).color,
							]),
						),
					});
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
					f.pass({ target: output, timer: clock?.span(node.name) }, pass.apply);
					values.set(node, output);
					for (const input of Object.values(node.inputs)) {
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
			for (const pass of effects.values()) {
				for (const buffer of pass.buffers.values()) {
					buffer.dispose();
				}
			}
			effects.clear();
			for (const image of targets) {
				image.color.dispose();
			}
			targets.length = 0;
		},
	};
}
