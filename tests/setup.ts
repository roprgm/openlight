import { transformWgsl } from "@vgpu/wgsl/loader-vite";
import { DOMParser } from "@xmldom/xmldom";
import { plugin } from "bun";

Object.assign(globalThis, { DOMParser });

await plugin({
	name: "wgsl",
	setup(build) {
		build.onLoad({ filter: /\.wgsl$/ }, async ({ path }) => ({
			contents: (await transformWgsl(await Bun.file(path).text(), path)).code,
			loader: "js",
		}));
	},
});
