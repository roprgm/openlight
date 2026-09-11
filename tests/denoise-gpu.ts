import { effect, frame, init, target } from "vgpu";
import { createDenoising } from "@/lib/denoise";
import { createDenoiseBlend } from "@/lib/denoise/blend";
import copyShader from "@/lib/denoise/blend.wgsl";

/** Exercise the real shader on 16-bit-derived samples without involving a file decoder. */
export async function verifyFloatDenoising() {
	const gpu = await init();
	const errors: string[] = [];
	gpu.gpu.addEventListener("uncapturederror", (e) =>
		errors.push(e.error.message),
	);
	const source = target(gpu, { size: [48, 32], format: "rgba16float" });
	const pixels = new Float32Array(48 * 32 * 4);
	const clean = new Float32Array(pixels.length);
	let seed = 13;
	const random = () => {
		seed = (1664525 * seed + 1013904223) >>> 0;
		return (seed + 1) / 4294967297;
	};
	for (let y = 0; y < 32; y++) {
		for (let x = 0; x < 48; x++) {
			const i = (y * 48 + x) * 4;
			for (let c = 0; c < 3; c++) {
				clean[i + c] = x >= 32 ? 1.5 : (12000 + c * 10) / 65535;
				pixels[i + c] =
					clean[i + c] +
					Math.round(
						180 *
							Math.sqrt(-2 * Math.log(random())) *
							Math.cos(2 * Math.PI * random()),
					) /
						65535;
			}
			pixels[i + 3] = clean[i + 3] = x < 4 ? x / 4 : 1;
			if (x === 0) {
				pixels[i] = -0.02;
			}
		}
	}
	const upload = gpu.device.createTexture({
		size: source.size,
		format: "rgba32float",
		usage: ["copy_dst", "texture_binding"],
	});
	gpu.gpu.queue.writeTexture(
		{ texture: upload.gpu },
		pixels,
		{ bytesPerRow: 48 * 16 },
		{ width: 48, height: 32 },
	);
	frame(gpu, (f) =>
		f.pass(
			source,
			effect(gpu, copyShader).set({
				source: upload,
				filtered: upload,
				amount: 0,
			}),
		),
	);
	upload.dispose();
	const uploaded = await source.color.readFloats();
	const denoising = createDenoising(gpu, source);
	const blend = createDenoiseBlend(gpu, source, denoising);
	try {
		await denoising.prepare(100);
		const output = denoising.texture();
		if (!output) {
			throw Error("Denoising did not produce an image.");
		}
		const filtered = await output.color.readFloats();
		const original = await source.color.readFloats();
		let errorBefore = 0,
			errorAfter = 0,
			hdrMinimum = Infinity;
		const levels = new Set<number>();
		for (let y = 8; y < 24; y++) {
			for (let x = 12; x < 24; x++) {
				for (let c = 0; c < 3; c++) {
					const i = (y * 48 + x) * 4 + c;
					errorBefore += (pixels[i] - clean[i]) ** 2;
					errorAfter += (filtered[i] - clean[i]) ** 2;
					levels.add(Math.round(filtered[i] * 65535));
				}
			}
		}
		for (let y = 8; y < 24; y++) {
			for (let x = 40; x < 48; x++) {
				hdrMinimum = Math.min(hdrMinimum, filtered[(y * 48 + x) * 4]);
			}
		}
		let zeroBypasses = false;
		frame(gpu, (f) => {
			zeroBypasses = blend.render(f, 0) === source;
		});
		return {
			errors,
			finite: filtered.every(Number.isFinite),
			errorBefore,
			errorAfter,
			hdrMinimum,
			precisionLevels: levels.size,
			alphaExact: filtered.every((v, i) => i % 4 !== 3 || v === uploaded[i]),
			transparentExact: filtered.every(
				(v, i) => Math.floor(i / 4) % 48 >= 4 || v === uploaded[i],
			),
			originalExact: original.every((v, i) => v === uploaded[i]),
			zeroBypasses,
		};
	} finally {
		blend.dispose();
		denoising.dispose();
		source.color.dispose();
		gpu.dispose();
	}
}
