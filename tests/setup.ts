import { type Duplex, Readable, Writable } from "node:stream";
import { createDeflate, createInflate } from "node:zlib";
import { transformWgsl } from "@vgpu/wgsl/loader-vite";
import { DOMParser } from "@xmldom/xmldom";
import { plugin } from "bun";

/** Bun lacks the compression stream globals the decoders use; zlib streams stand in. */
function webStream(create: () => Duplex) {
	return class {
		readable: ReadableStream;
		writable: WritableStream;
		constructor() {
			const stream = create();
			this.readable = Readable.toWeb(stream) as unknown as ReadableStream;
			this.writable = Writable.toWeb(stream);
		}
	};
}

Object.assign(globalThis, {
	DOMParser,
	CompressionStream: webStream(createDeflate),
	DecompressionStream: webStream(createInflate),
});

await plugin({
	name: "wgsl",
	setup(build) {
		build.onLoad({ filter: /\.wgsl$/ }, async ({ path }) => ({
			contents: (await transformWgsl(await Bun.file(path).text(), path)).code,
			loader: "js",
		}));
	},
});
