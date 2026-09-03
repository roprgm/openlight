import { defineConfig } from "@playwright/test";

const args = ["--enable-unsafe-webgpu"];
if (process.platform !== "darwin") {
	args.push("--use-webgpu-adapter=swiftshader");
}

export default defineConfig({
	testDir: "./tests",
	testMatch: "**/*.e2e.ts",
	use: {
		channel: "chromium",
		baseURL: "http://127.0.0.1:4173",
		launchOptions: { args },
	},
	webServer: {
		command: "bun run dev -- --host 127.0.0.1 --port 4173 --strictPort",
		reuseExistingServer: !process.env.CI,
		url: "http://127.0.0.1:4173",
	},
});
