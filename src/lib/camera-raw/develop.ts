import { effect, frame, type Gpu, type Target, target } from "vgpu";
import { createPipeline, type ImageStage } from "@/lib/pipeline";
import { uploadTiff } from "@/lib/tiff-gpu";
import demosaicShader from "./demosaic.wgsl";
import developShader from "./develop.wgsl";
import type { PreparedDng } from "./dng";
import normalizeShader from "./normalize.wgsl";

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
		const [x, y, width, height] = raw.crop;
		const stages: ImageStage<void>[] = [];
		function pass(
			id: string,
			shader: Parameters<typeof effect>[1],
			values: Record<string, unknown>,
			size: readonly [number, number] = source.size,
			format: Target["format"] = "rgba32float",
		) {
			const output = target(gpu, { size, format });
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
		const map = raw.gainMap;
		const gains = gpu.device.createBuffer({
			size: map?.values.byteLength ?? 4,
			usage: ["storage", "copy_dst"],
		});
		owned.add(gains);
		gains.write(map?.values ?? new Float32Array([1]));
		pass(
			"working-color",
			developShader,
			{
				gains,
				gainParams: {
					area: [
						raw.active[1],
						raw.active[0],
						raw.active[3] - raw.active[1],
						raw.active[2] - raw.active[0],
					],
					points: map?.points ?? [1, 1, 0],
					spacing: map?.spacing ?? [1, 1],
					origin: map?.origin ?? [0, 0],
					weights: map?.weights.slice(0, 3) ?? [0, 0, 0],
					minimum: map?.weights[3] ?? 0,
					maximum: map?.weights[4] ?? 0,
				},
				params: {
					origin: [x, y],
					size: [width, height],
					orientation: raw.orientation,
					matrix: raw.matrix,
					neutral: raw.neutral,
					exposure: 2 ** raw.exposure,
				},
			},
			raw.orientation >= 5 ? [height, width] : [width, height],
			"rgba16float",
		);
		const pipeline = createPipeline(source, stages);
		return {
			...pipeline,
			/** Transfer the final texture to a decoded image resource; scratch stays owned here. */
			takeOutput() {
				const image = pipeline.output("working-color");
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

/** Decode uses a single development run; retain only its returned working-space texture. */
export function developDng(gpu: Gpu, prepared: PreparedDng): Target {
	const pipeline = createDevelopment(gpu, prepared);
	try {
		frame(gpu, (f) => {
			pipeline.render(f, undefined);
		});
		return pipeline.takeOutput();
	} finally {
		pipeline.dispose();
	}
}
