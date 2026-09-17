import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Run against a local dev server. Pass its URL and either "before" or "after".
const [url = "http://127.0.0.1:4173", revision = "after"] =
	process.argv.slice(2);
const directory = new URL("./", import.meta.url);
const browser = await chromium.launch({
	channel: "chromium",
	args: [
		"--enable-unsafe-webgpu",
		"--use-webgpu-adapter=swiftshader",
		"--enable-features=Vulkan",
		"--use-angle=vulkan",
		"--use-vulkan=swiftshader",
		"--disable-vulkan-surface",
	],
});
try {
	await mkdir(directory, { recursive: true });
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(url);
	await page
		.locator('input[type="file"]')
		.setInputFiles("tests/fixtures/photo.svg");
	const histogram = page
		.getByLabel("output histogram", { exact: true })
		.locator("polyline")
		.first();
	await expect(histogram).toHaveAttribute("points", /,\d{1,2}\./);
	for (const name of ["Light", "Color", "Color Mixer"]) {
		await page.getByRole("button", { name, exact: true }).click();
	}
	const states =
		revision === "before"
			? [{ name: "before", intensity: 0, softness: 50 }]
			: [
					{ name: "neutral", intensity: 0, softness: 50 },
					{ name: "hard", intensity: 80, softness: 0 },
					{ name: "soft", intensity: 80, softness: 100 },
				];
	for (const state of states) {
		if (revision !== "before") {
			const previous = await histogram.getAttribute("points");
			for (const [name, value] of [
				["Intensity", state.intensity],
				["Softness", state.softness],
			]) {
				const field = page.getByRole("textbox", { name, exact: true });
				await field.fill(String(value));
				await field.press("Enter");
			}
			if (state.intensity) {
				await expect(histogram).not.toHaveAttribute("points", previous);
			}
		}
		const sidebar = await page.getByRole("complementary").boundingBox();
		if (!sidebar) {
			throw new Error("Missing Adjust panel.");
		}
		await page.screenshot({
			animations: "disabled",
			path: new URL(`${state.name}-ui.png`, directory).pathname,
			clip: { x: sidebar.x, y: 0, width: 1440 - sidebar.x, height: 680 },
		});
		const pixels = await page.evaluate(async () => [
			...new Uint8Array(
				await (
					await window.openlight.exportImage({ longEdge: 960 })
				).arrayBuffer(),
			),
		]);
		await writeFile(
			new URL(`${state.name}-export.png`, directory),
			new Uint8Array(pixels),
		);
	}
	expect(errors).toEqual([]);
} finally {
	await browser.close();
}
