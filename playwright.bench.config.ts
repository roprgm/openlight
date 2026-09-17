import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig(config, {
	testMatch: "**/*.bench.ts",
	workers: 1,
	timeout: 180_000,
	outputDir: "test-results/benchmarks",
});
