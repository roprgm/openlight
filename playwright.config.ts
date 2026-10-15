import { defineConfig } from "@playwright/test";

const args = ["--enable-unsafe-webgpu"];
const features = ["WebMCP"];
if (process.platform === "win32") {
  args.push("--use-webgpu-adapter=swiftshader");
}
if (process.platform === "linux") {
  // ANGLE on Vulkan gives headless Chromium the machine's GPU for WebGPU and canvases.
  features.push("Vulkan");
  args.push("--use-angle=vulkan");
}
args.push(`--enable-features=${features.join(",")}`);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  use: {
    // Modal's GPU sandboxes give WebGPU to the headless shell build only.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    baseURL: "http://127.0.0.1:4173",
    launchOptions: { args },
  },
  webServer: {
    command: "bun run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:4173",
  },
});
