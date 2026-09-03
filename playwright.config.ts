import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "**/*.e2e.ts",
	use: {
		baseURL: "http://127.0.0.1:4173",
		launchOptions: {
			args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"],
		},
	},
	webServer: {
		command: "bun run dev -- --host 127.0.0.1 --port 4173 --strictPort",
		reuseExistingServer: !process.env.CI,
		url: "http://127.0.0.1:4173",
	},
});
