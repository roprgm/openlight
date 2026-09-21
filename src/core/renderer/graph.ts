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

type Pass = {
	shader: RenderNode["shader"];
	effect: Effect;
	buffers: Map<string, Buffer>;
};

function plan(outputs: readonly RenderImage[]) {
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
			live.add(image.target);
			return;
		}
		if (names.has(image.name)) {
			throw Error(`Duplicate render node: ${image.name}.`);
		}
		names.add(image.name);
		Object.values(image.inputs).forEach(visit);
		order.push(image);
	}
	// Requested outputs count as consumers, keeping their targets live.
	outputs.forEach(visit);
	return { order, uses, live };
}

/** Owns effects, storage buffers, and transient targets for one renderer. */
export function createRenderGraph(gpu: Gpu, timer?: Timer) {
	const pool: Target[] = [];
	const effects = new Map<string, Pass>();
	let passes: string[] = [];
	let disposed = false;
	function prepare(node: RenderNode) {
		let pass = effects.get(node.name);
		if (!pass) {
			const bindings = Object.fromEntries(
				Object.entries(node.samplers ?? {}).map(([name, descriptor]) => [
					name,
					sampler(gpu, descriptor),
				]),
			);
			pass = {
				shader: node.shader,
				effect: effect(gpu, node.shader, {
					label: node.name,
					set: bindings,
				}),
				buffers: new Map(),
			};
			effects.set(node.name, pass);
		}
		if (pass.shader !== node.shader) {
			throw Error(`Render node ${node.name} changed shader; use a new name.`);
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
				pass.effect.set({ [name]: buffer });
			}
			buffer.write(data);
		}
		return pass.effect;
	}
	function acquire(
		node: RenderNode,
		live: ReadonlySet<Target>,
		written: ReadonlySet<Target>,
	) {
		const exact = pool.find(
			(image) =>
				!live.has(image) &&
				image.format === node.format &&
				image.size[0] === node.size[0] &&
				image.size[1] === node.size[1],
		);
		if (exact) {
			return exact;
		}
		// Resize only targets not referenced by commands in this frame.
		const spare = pool.find(
			(image) =>
				!live.has(image) && !written.has(image) && image.format === node.format,
		);
		if (spare) {
			spare.resize(node.size);
			return spare;
		}
		const image = target(gpu, { size: node.size, format: node.format });
		pool.push(image);
		return image;
	}
	return {
		/** Retire removed composition instances; bypassed instances remain reusable. */
		release(prefix: string) {
			for (const [name, pass] of effects) {
				if (name.startsWith(prefix)) {
					for (const buffer of pass.buffers.values()) {
						buffer.dispose();
					}
					effects.delete(name);
				}
			}
		},
		render(outputs: readonly RenderImage[]) {
			if (disposed) {
				throw Error("Render graph is closed.");
			}
			const { order, uses, live } = plan(outputs);
			const results = new Map<RenderNode, Target>();
			function resolve(image: RenderImage): Target {
				if (!("inputs" in image)) {
					return image.target;
				}
				const result = results.get(image);
				if (!result) {
					throw Error(`Unrendered node: ${image.name}.`);
				}
				return result;
			}
			const written = new Set<Target>();
			frame(gpu, (frame) => {
				for (const node of order) {
					const pass = prepare(node);
					pass.set({
						...node.set,
						...Object.fromEntries(
							Object.entries(node.inputs).map(([name, image]) => [
								name,
								resolve(image).color,
							]),
						),
					});
					const output = acquire(node, live, written);
					live.add(output);
					written.add(output);
					frame.pass({ target: output, timer: timer?.span(node.name) }, pass);
					results.set(node, output);
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
			for (let i = pool.length - 1; i >= 0; i--) {
				if (!written.has(pool[i]) && !live.has(pool[i])) {
					pool[i].color.dispose();
					pool.splice(i, 1);
				}
			}
			passes = order.map((node) => node.name);
			return outputs.map(resolve);
		},
		inspect() {
			return {
				passes: [...passes],
				textures: pool.map(({ size, format }) => ({
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
			for (const image of pool) {
				image.color.dispose();
			}
			pool.length = 0;
		},
	};
}
