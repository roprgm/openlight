import { readdir } from "node:fs/promises";
import { init } from "vgpu/node";
import { benchmark } from "./testing";

/** `bun run --preload ./tests/setup.ts src/lib/tiff-gpu/bench.ts <folder>`: times both halves on every TIFF in the folder. */
const folder = process.argv[2];
if (!folder) {
	throw new Error("Pass a folder of TIFF files.");
}
const gpu = await init();
const variants = { default: {} };
for (const name of (await readdir(folder))
	.filter((n) => /\.tiff?$/i.test(n))
	.sort()) {
	const row = await benchmark(
		gpu,
		await Bun.file(`${folder}/${name}`).arrayBuffer(),
		variants,
	);
	console.log(name, JSON.stringify(row));
}
gpu.dispose();
