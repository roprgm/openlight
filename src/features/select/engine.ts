import {
	effect,
	type Frame,
	frame,
	type Gpu,
	sampler,
	type Target,
	target,
} from "vgpu";
import { createSelectionCompute } from "./compute";
import type { Affinity, Operation, SelectionOptions } from "./cost";
import { grow } from "./grow";
import overlayShader from "./overlay.wgsl";
import refineShader from "./refine.wgsl";

const operations: Record<Operation, number> = {
	replace: 0,
	add: 1,
	subtract: 2,
	intersect: 3,
};

/** GPU resources and exact grow for one document. All coordinates refer to outputImage. */
export function createSelectionEngine(gpu: Gpu) {
	const texture = (format: "rgba16float" | "r32float") =>
		gpu.device.createTexture({
			size: [1, 1],
			format,
			usage: ["storage_binding", "texture_binding", "copy_src", "copy_dst"],
		});
	const affinity = texture("rgba16float");
	const edges = texture("r32float");
	const distances = [texture("r32float"), texture("r32float")];
	let committed = target(gpu, { size: [1, 1], format: "r8unorm" });
	let preview = target(gpu, { size: [1, 1], format: "r8unorm" });
	const linearSampler = sampler(gpu, {
		minFilter: "linear",
		magFilter: "linear",
	});
	const compute = createSelectionCompute(gpu, affinity, edges, distances);
	const refine = effect(gpu, refineShader, { set: { linearSampler } });
	const overlay = effect(gpu, overlayShader, {
		blend: "alpha",
		set: { linearSampler },
	});
	let size: readonly [number, number] = [1, 1];
	let field: Promise<Affinity> | undefined;
	let revision = 0;
	let committing = false;
	let gesture:
		| { seed: number; options: SelectionOptions; operation: Operation }
		| undefined;
	let hasMask = false;
	let disposed = false;
	function clear() {
		revision++;
		gesture = undefined;
		hasMask = false;
		frame(gpu, (f) =>
			f.pass({ target: committed, clear: [0, 0, 0, 0] }, () => {}),
		);
	}
	function renderMask(f: Frame) {
		if (!gesture) return;
		f.pass(
			preview,
			refine.set({
				costs: distances[0],
				base: committed.color,
				params: {
					size: committed.size,
					tolerance: gesture.options.tolerance,
					feather: gesture.options.feather,
					operation: operations[gesture.operation],
				},
			}),
		);
	}
	return {
		mask: () => (gesture ? preview : committed),
		prepare(image: Target) {
			revision++;
			gesture = undefined;
			committing = false;
			if (image.size.some((n, i) => n !== committed.size[i])) {
				committed.resize(image.size);
				preview.resize(image.size);
				clear();
			}
			const scale = Math.min(1, 1536 / Math.max(...image.size));
			size = [
				Math.max(1, Math.round(image.size[0] * scale)),
				Math.max(1, Math.round(image.size[1] * scale)),
			];
			for (const item of [affinity, edges, ...distances]) item.resize(size);
			compute.prepare(image.color);
			// Start readback once per rendered image, never per pointer move. Both paths see half-float Lab.
			const [width, height] = size;
			field = Promise.all([affinity.readFloats(), edges.readFloats()]).then(
				([lab, edge]) => ({ width, height, lab, edge }),
			);
			return field.then(() => {});
		},
		begin(
			point: readonly [number, number],
			options: SelectionOptions,
			operation: Operation,
		) {
			if (!field) throw new Error("The selection image is not ready.");
			if (
				point.some(
					(n, i) => !Number.isFinite(n) || n < 0 || n >= committed.size[i],
				)
			)
				throw new Error("Selection point must be inside the output image.");
			revision++;
			const x = Math.min(
				size[0] - 1,
				Math.floor((point[0] * size[0]) / committed.size[0]),
			);
			const y = Math.min(
				size[1] - 1,
				Math.floor((point[1] * size[1]) / committed.size[1]),
			);
			gesture = { seed: y * size[0] + x, options, operation };
			committing = false;
			compute.configure(gesture.seed, options);
			compute.restart();
		},
		change(options: SelectionOptions) {
			if (!gesture) return;
			const previous = gesture.options;
			gesture = { ...gesture, options };
			revision++;
			compute.configure(gesture.seed, options);
			// Increasing the budget can continue the existing frontier during a tolerance scrub.
			if (
				options.tolerance < previous.tolerance ||
				options.sampleSize !== previous.sampleSize ||
				options.contiguous !== previous.contiguous
			)
				compute.restart();
		},
		preview(f: Frame) {
			if (!gesture || committing) return;
			if (gesture.options.contiguous) compute.preview();
			renderMask(f);
		},
		async commit() {
			if (!gesture || !field) return null;
			committing = true;
			const request = ++revision;
			const { seed, options } = gesture;
			const data = await field;
			if (request !== revision || disposed) return null;
			const steps = grow(data, seed, options);
			let result = steps.next();
			while (!result.done) {
				await new Promise((resolve) => setTimeout(resolve, 0));
				if (request !== revision || disposed) return null;
				result = steps.next();
			}
			// Encode the exact binary result as costs, so refinement and mask algebra are shared.
			const costs = result.value.map((value) => (value ? 0 : 1e20));
			gpu.gpu.queue.writeTexture(
				{ texture: distances[0].gpu },
				costs,
				{ bytesPerRow: size[0] * 4 },
				size,
			);
			frame(gpu, renderMask);
			// Read the actual combined soft mask for semantic state (subtract/intersect can empty it).
			const mask = await preview.readFloats();
			if (request !== revision || disposed) return null;
			[committed, preview] = [preview, committed];
			gesture = undefined;
			committing = false;
			let count = 0;
			const bounds = [committed.size[0], committed.size[1], 0, 0];
			for (let i = 0; i < mask.length; i++) {
				if (mask[i] < 0.5) continue;
				count++;
				const x = i % committed.size[0];
				const y = Math.floor(i / committed.size[0]);
				bounds[0] = Math.min(bounds[0], x);
				bounds[1] = Math.min(bounds[1], y);
				bounds[2] = Math.max(bounds[2], x + 1);
				bounds[3] = Math.max(bounds[3], y + 1);
			}
			hasMask = count > 0;
			return { count, bounds: count ? bounds : null };
		},
		cancel() {
			revision++;
			gesture = undefined;
			committing = false;
		},
		clear,
		draw(
			f: Frame,
			canvas: Target & { dpr: number },
			view: { scale: number; pan: readonly number[] },
		) {
			if (!gesture && !hasMask) return;
			f.pass(
				{ target: canvas, clear: false },
				overlay.set({
					mask: gesture ? preview.color : committed.color,
					view: {
						size: canvas.size,
						imageSize: committed.size,
						pan: view.pan.map((n) => n * canvas.dpr),
						scale: view.scale * canvas.dpr,
						time: performance.now() / 1000,
					},
				}),
			);
		},
		dispose() {
			disposed = true;
			compute.dispose();
			revision++;
			for (const item of [
				affinity,
				edges,
				...distances,
				committed.color,
				preview.color,
			])
				item.dispose();
		},
	};
}
