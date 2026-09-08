import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";

const dir = process.env.BENCH_DIR ?? "";
const port = 4174;
const variants = {
	cpu: { gpuChunks: Number.MAX_SAFE_INTEGER },
	gpu: { gpuChunks: 0 },
};

test("benchmark tiff-gpu variants", async ({ page }) => {
	test.skip(!dir, "Set BENCH_DIR to a folder of TIFF files.");
	test.setTimeout(30 * 60_000);
	const filter = process.env.BENCH_FILES?.split(",") ?? [];
	const names = (await readdir(dir))
		.filter(
			(n) =>
				n.endsWith(".tif") &&
				(!filter.length || filter.some((f) => n.includes(f))),
		)
		.sort();
	const server = createServer(async (request, response) => {
		response.setHeader("Access-Control-Allow-Origin", "*");
		response.end(
			await readFile(
				`${dir}/${decodeURIComponent(request.url?.split("/").pop() ?? "")}`,
			),
		);
	});
	await new Promise<void>((resolve) => server.listen(port, resolve));
	page.on("console", (message) => {
		if (message.type() === "error")
			console.log("[browser]", message.text().slice(0, 400));
	});
	try {
		await page.goto("/");
		await page.waitForFunction(() => window.openlight);
		for (const name of names) {
			const result = await page.evaluate(
				async ({ url, variants }) => {
					const path = "/src/lib/tiff-gpu/bench.ts";
					const { benchmark } = await import(/* @vite-ignore */ path);
					return benchmark([url], variants);
				},
				{ url: `http://127.0.0.1:${port}/${name}`, variants },
			);
			console.log(JSON.stringify(result[0]));
			expect(result).toHaveLength(1);
		}
	} finally {
		server.close();
	}
});
