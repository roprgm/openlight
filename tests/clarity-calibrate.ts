import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { effect, frame, init, target } from "vgpu/node";
import { createUnsharpMask } from "@/lib/unsharp-mask";
import io from "./clarity-io.wgsl";

// Run with: bun --preload ./tests/setup.ts tests/clarity-calibrate.ts
const directory = process.argv[2] ?? "public/debug";
const selected = process.argv[3];
const series = process.argv[4] ?? "clarity";
const sourceName = series === "clarity" ? "export.png" : `${series}.png`;
const amounts = selected
	? [Number(selected)]
	: [-100, -75, -50, -25, 0, 25, 50, 75, 100];
if (
	amounts.some((amount) => !Number.isFinite(amount) || Math.abs(amount) > 100)
)
	throw new Error("Clarity must be a number between -100 and 100.");
const input = PNG.sync.read(
	Buffer.from(await Bun.file(join(directory, sourceName)).arrayBuffer()),
);
const size: [number, number] = [input.width, input.height];
const chart: { rois: { id: string; rect: number[] }[] } = await Bun.file(
	new URL("../docs/research/detail-filters-test-chart.json", import.meta.url),
).json();
const gpu = await init();
const encoded = gpu.device.createTexture({
	size,
	format: "rgba8unorm-srgb",
	usage: ["texture_binding", "copy_dst"],
});
const source = target(gpu, { size, format: "rgba16float" });
const output = target(gpu, { size, format: "rgba8unorm" });
const convert = effect(gpu, io);
const clarity = createUnsharpMask(gpu, source, 16);
const results = [];

function label(amount: number) {
	if (amount < 0) return `minus${-amount}`;
	if (amount > 0) return `plus${amount}`;
	return "0";
}

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function errors(
	actual: Uint8Array,
	expected: Uint8Array,
	rect = [0, 0, ...size],
	activeOnly = false,
) {
	const histogram = new Uint32Array(256);
	let sum = 0;
	let maximum = 0;
	let count = 0;
	const [left, top, width, height] = rect;
	for (let y = top; y < top + height; y++) {
		for (let x = left; x < left + width; x++) {
			for (let channel = 0; channel < 3; channel++) {
				const i = (y * input.width + x) * 4 + channel;
				if (activeOnly && Math.abs(expected[i] - input.data[i]) <= 1) continue;
				const difference = Math.abs(actual[i] - expected[i]);
				histogram[difference]++;
				sum += difference;
				maximum = Math.max(maximum, difference);
				count++;
			}
		}
	}
	function percentile(fraction: number) {
		let total = 0;
		for (let error = 0; error < histogram.length; error++) {
			total += histogram[error];
			if (total >= count * fraction) return error;
		}
		return maximum;
	}
	return {
		samples: count,
		median: percentile(0.5),
		mean: count ? sum / count : 0,
		p95: percentile(0.95),
		maximum,
	};
}

try {
	gpu.gpu.pushErrorScope("validation");
	gpu.gpu.queue.writeTexture(
		{ texture: encoded.gpu },
		input.data,
		{ bytesPerRow: input.width * 4 },
		size,
	);
	frame(gpu, (f) =>
		f.pass(source, convert.set({ source: encoded, decode: 1 })),
	);
	await mkdir(join(directory, `${series}-results`), { recursive: true });
	for (const amount of amounts) {
		const name = `${series}-${label(amount)}.png`;
		const reference = PNG.sync.read(
			Buffer.from(await Bun.file(join(directory, name)).arrayBuffer()),
		);
		if (reference.width !== input.width || reference.height !== input.height)
			throw new Error(`${name} has different dimensions.`);
		const start = performance.now();
		frame(gpu, (f) => {
			const result = clarity.render(f, source, amount / 200, 64);
			f.pass(output, convert.set({ source: result.color, decode: 0 }));
		});
		const actual = await output.read();
		const milliseconds = performance.now() - start;
		const result = { amount, ...errors(actual, reference.data), milliseconds };
		results.push({
			...result,
			referencePixelsSha256: hash(reference.data),
			active: errors(actual, reference.data, undefined, true),
			regions:
				series === "clarity"
					? chart.rois.map(({ id, rect }) => ({
							id,
							...errors(actual, reference.data, rect),
						}))
					: [],
		});
		console.log(JSON.stringify(result));
		const png = new PNG({ width: input.width, height: input.height });
		png.data = Buffer.from(actual);
		await Bun.write(
			join(directory, `${series}-results`, name),
			PNG.sync.write(png),
		);
	}
	const validation = await gpu.gpu.popErrorScope();
	if (validation) throw new Error(validation.message);
	await Bun.write(
		join(directory, `${series}-results`, "metrics.json"),
		JSON.stringify(
			{
				units:
					"absolute encoded sRGB error in 8-bit code values, all RGB samples",
				source: sourceName,
				sourcePixelsSha256: hash(input.data),
				activeDefinition:
					"RGB samples where reference differs from input by more than one code value",
				results,
			},
			null,
			2,
		),
	);
} finally {
	clarity.dispose();
	encoded.dispose();
	source.color.dispose();
	output.color.dispose();
	gpu.dispose();
}
