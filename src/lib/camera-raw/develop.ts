import { effect, frame, type Gpu, target } from "vgpu";
import type { ImageSource } from "@/lib/image-source";
import { createPipeline, type ImageStage } from "@/lib/pipeline";
import { uploadTiff } from "@/lib/tiff-gpu";
import demosaicShader from "./demosaic.wgsl";
import type { PreparedDng } from "./dng";
import normalizeShader from "./normalize.wgsl";
import { createWorkingColor } from "./working-color";

/** Reusable development stages. The caller can inspect normalized samples before interpolation. */
export function createDevelopment(gpu: Gpu, { prepared, raw }: PreparedDng) {
	const source = uploadTiff(gpu, prepared, { format: "rgba32float" });
	const owned = new Set<{ dispose(): void }>([source.color]);
	try {
		const data = Float32Array.from([
			...raw.black,
			...raw.blackDeltaH,
			...raw.blackDeltaV,
			...raw.linearization,
		]);
		const levels = gpu.device.createBuffer({
			size: data.byteLength,
			usage: ["storage", "copy_dst"],
		});
		owned.add(levels);
		levels.write(data);
		const stages: ImageStage<void>[] = [];
		function pass(
			id: string,
			shader: Parameters<typeof effect>[1],
			values: Record<string, unknown>,
		) {
			const output = target(gpu, { size: source.size, format: "rgba32float" });
			owned.add(output.color);
			const apply = effect(gpu, shader).set(values);
			stages.push({
				id,
				input: stages.at(-1)?.id ?? "source",
				dispose() {
					if (owned.delete(output.color)) output.color.dispose();
				},
				render(frame, input) {
					frame.pass(output, apply.set({ source: input.color }));
					return output;
				},
			});
		}
		pass("normalize", normalizeShader, {
			levels,
			params: {
				origin: [raw.active[1], raw.active[0]],
				repeat: [raw.blackRepeat[1], raw.blackRepeat[0]],
				samples: raw.image.samplesPerPixel,
				scale:
					prepared.info.sampleFormat === 3
						? 1
						: 2 ** prepared.info.bitsPerSample - 1,
				white: Array.from(
					{ length: 4 },
					(_, i) => raw.white[Math.min(i, raw.white.length - 1)],
				),
				deltaH: raw.black.length,
				deltaHSize: raw.blackDeltaH.length,
				deltaV: raw.black.length + raw.blackDeltaH.length,
				deltaVSize: raw.blackDeltaV.length,
				lookup:
					raw.black.length + raw.blackDeltaH.length + raw.blackDeltaV.length,
				lookupSize: raw.linearization.length,
			},
		});
		if (raw.kind === "bayer")
			pass("demosaic", demosaicShader, { pattern: raw.pattern });
		const color = createWorkingColor(gpu, raw);
		stages.push({
			id: "working-color",
			input: raw.kind === "bayer" ? "demosaic" : "normalize",
			dispose: color.dispose,
			render: (frame, input) => color.render(frame, input),
		});
		const pipeline = createPipeline(source, stages);
		return {
			...pipeline,
			/** Transfer the final texture to a decoded image resource; scratch stays owned here. */
			takeOutput: color.takeOutput,
			takeCamera() {
				const image = pipeline.output(
					raw.kind === "bayer" ? "demosaic" : "normalize",
				);
				owned.delete(image.color);
				return image;
			},
			dispose() {
				pipeline.dispose();
				for (const resource of owned) resource.dispose();
				owned.clear();
			},
		};
	} catch (error) {
		for (const resource of owned) resource.dispose();
		throw error;
	}
}

/** Expose editable white balance through a format-independent image capability. */
export function developDng(gpu: Gpu, prepared: PreparedDng): ImageSource {
	const pipeline = createDevelopment(gpu, prepared);
	try {
		frame(gpu, (f) => pipeline.render(f, undefined));
		const image = pipeline.takeOutput();
		const raw = prepared.raw;
		const profile = raw.whiteBalance;
		if (!profile) return { image };
		const camera = pipeline.takeCamera();
		return {
			image,
			whiteBalance: {
				asShot: profile.asShot,
				create(gpu) {
					const color = createWorkingColor(gpu, raw);
					return {
						render: (frame, balance) => color.render(frame, camera, balance),
						dispose: color.dispose,
					};
				},
				dispose: () => camera.color.dispose(),
			},
		};
	} finally {
		pipeline.dispose();
	}
}
