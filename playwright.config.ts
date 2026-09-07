import { defineConfig } from "@playwright/test";

const linux = process.platform !== "darwin";
const args = ["--enable-unsafe-webgpu"];
if (linux) {
	// Software Vulkan for WebGPU and the compositor alike, so canvases present and read back without a GPU.
	args.push(
		"--enable-features=Vulkan",
		"--use-vulkan=swiftshader",
		"--use-angle=vulkan",
		"--disable-vulkan-surface",
		"--ignore-gpu-blocklist",
	);
}

export default defineConfig({
	testDir: "./tests",
	testMatch: "**/*.e2e.ts",
	// Software rendering takes minutes for the editing session.
	timeout: linux ? 300_000 : 30_000,
	use: {
		channel: "chromium",
		// Headless Chromium on Linux leaves WebGPU canvases out of screenshots; CI runs headed under Xvfb.
		headless: !linux,
		baseURL: "http://127.0.0.1:4173",
		launchOptions: { args },
	},
	webServer: {
		command: "bun run dev -- --host 127.0.0.1 --port 4173 --strictPort",
		reuseExistingServer: !process.env.CI,
		url: "http://127.0.0.1:4173",
	},
});
