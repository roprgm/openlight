import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import type { Browser, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";

async function saveReport(info: TestInfo, browser: Browser, timings: object) {
	const report = {
		revision: execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim(),
		workingTreeChanged: !!execFileSync("git", ["status", "--porcelain"], {
			encoding: "utf8",
		}).trim(),
		browser: browser.version(),
		platform: process.platform,
		kernel: release(),
		cpu: cpus()[0]?.model,
		logicalCpus: cpus().length,
		flags: info.project.use.launchOptions?.args,
		...timings,
	};
	await writeFile(
		info.outputPath("timings.json"),
		JSON.stringify(report, null, 2),
	);
}

for (const fixture of [
	"denoise-noisy.correlated.png",
	"denoise-noisy.dng",
	"denoise-noisy.chroma.dng",
]) {
	test(`cached denoising ${fixture}`, async ({ page, browser }, info) => {
		await page.goto("/tests/gpu.html");
		const result = await page.evaluate(
			async ({ fixture, active }) => {
				const path = "/tests/denoise-benchmark.ts";
				const { benchmarkDenoising } = (await import(
					path
				)) as typeof import("./denoise-benchmark");
				return benchmarkDenoising(fixture, active);
			},
			{ fixture, active: !process.env.NR_BASELINE },
		);
		const { before, after, ...timings } = result;
		expect(timings.neutral.completedMs.samples).toHaveLength(timings.samples);
		if (timings.cached) {
			expect(timings.cached.completedMs.samples).toHaveLength(timings.samples);
		}
		await saveReport(info, browser, timings);
		for (const [name, bytes] of [
			["before", before],
			["after", after],
		] as const) {
			await writeFile(info.outputPath(`${name}.png`), new Uint8Array(bytes));
		}
		console.log(
			JSON.stringify({
				fixture,
				firstActiveMs: timings.firstActiveMs,
				neutral: timings.neutral.completedMs.median,
				cached: timings.cached?.completedMs.median,
			}),
		);
	});
}

test("cached amount blend at 20 megapixels", async ({
	page,
	browser,
}, info) => {
	test.skip(!!process.env.NR_BASELINE, "Main has no noise reduction blend.");
	await page.goto("/tests/gpu.html");
	const result = await page.evaluate(async () => {
		const path = "/tests/denoise-benchmark.ts";
		const { benchmarkBlend } = (await import(
			path
		)) as typeof import("./denoise-benchmark");
		return benchmarkBlend();
	});
	expect(result.rendering.completedMs.samples).toHaveLength(result.samples);
	if (result.timestamps) {
		expect(result.rendering.missingGpuSamples).toBe(0);
	}
	await saveReport(info, browser, result);
	console.log(
		JSON.stringify({
			blendGpuMs: result.rendering.gpuMs?.median,
			completedMs: result.rendering.completedMs.median,
		}),
	);
});
