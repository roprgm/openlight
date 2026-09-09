import { type Gpu, sampler, type Texture } from "vgpu";
import affinityShader from "./affinity.wgsl";
import { EDGE_WEIGHT, type SelectionOptions, TEXTURE_WEIGHT } from "./cost";
import previewShader from "./preview.wgsl";

const PREVIEW_ITERATIONS = 16;

/** vgpu 0.3 cannot bind storage textures. Use its device for these three native compute passes. */
export function createSelectionCompute(
	gpu: Gpu,
	affinity: Texture,
	edges: Texture,
	distances: Texture[],
) {
	const device = gpu.gpu;
	const analysisModule = device.createShaderModule({
		code: affinityShader.wgsl,
	});
	const previewModule = device.createShaderModule({ code: previewShader.wgsl });
	const analyze = device.createComputePipeline({
		layout: "auto",
		compute: { module: analysisModule, entryPoint: "main" },
	});
	const initialize = device.createComputePipeline({
		layout: "auto",
		compute: { module: previewModule, entryPoint: "initialize" },
	});
	const expand = device.createComputePipeline({
		layout: "auto",
		compute: { module: previewModule, entryPoint: "grow" },
	});
	const uniform = gpu.device.createBuffer({
		size: 32,
		usage: ["uniform", "copy_dst"],
	});
	const linearSampler = sampler(gpu, {
		minFilter: "linear",
		magFilter: "linear",
	});
	let initial: GPUBindGroup;
	let groups: GPUBindGroup[] = [];
	function dispatch(pipeline: GPUComputePipeline, bindings: GPUBindGroup[]) {
		const encoder = device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(pipeline);
		for (const group of bindings) {
			pass.setBindGroup(0, group);
			pass.dispatchWorkgroups(
				Math.ceil(affinity.size[0] / 8),
				Math.ceil(affinity.size[1] / 8),
			);
		}
		pass.end();
		device.queue.submit([encoder.finish()]);
	}
	return {
		prepare(source: Texture) {
			const group = device.createBindGroup({
				layout: analyze.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: source.view },
					{ binding: 1, resource: linearSampler },
					{ binding: 2, resource: affinity.view },
					{ binding: 3, resource: edges.view },
				],
			});
			dispatch(analyze, [group]);
			initial = device.createBindGroup({
				layout: initialize.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: affinity.view },
					{ binding: 3, resource: distances[0].view },
					{ binding: 4, resource: { buffer: uniform.gpu } },
				],
			});
			groups = distances.map((previous, i) =>
				device.createBindGroup({
					layout: expand.getBindGroupLayout(0),
					entries: [
						{ binding: 0, resource: affinity.view },
						{ binding: 1, resource: edges.view },
						{ binding: 2, resource: previous.view },
						{ binding: 3, resource: distances[1 - i].view },
						{ binding: 4, resource: { buffer: uniform.gpu } },
					],
				}),
			);
		},
		configure(seed: number, options: SelectionOptions) {
			const bytes = new ArrayBuffer(32);
			const uint = new Uint32Array(bytes);
			const float = new Float32Array(bytes);
			uint[0] = seed % affinity.size[0];
			uint[1] = Math.floor(seed / affinity.size[0]);
			float[2] = options.tolerance;
			uint[3] = options.sampleSize;
			uint[4] = Number(options.contiguous);
			float[5] = EDGE_WEIGHT;
			float[6] = TEXTURE_WEIGHT;
			uniform.write(bytes);
		},
		restart: () => dispatch(initialize, [initial]),
		preview() {
			// An even number of ping-pong iterations always leaves the result in distances[0].
			dispatch(
				expand,
				Array.from({ length: PREVIEW_ITERATIONS }, (_, i) => groups[i % 2]),
			);
		},
		dispose: () => uniform.dispose(),
	};
}
