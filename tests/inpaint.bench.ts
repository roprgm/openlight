import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import { expect, test } from "./fixtures";

for (const scope of ["solver", "editor"] as const) {
  test(`inpainting ${scope}`, async ({ page, browser }, info) => {
    test.setTimeout(600_000);
    await page.goto("/tests/gpu.html");
    const result = await page.evaluate(async (scope) => {
      const path = "/tests/inpaint-benchmark.ts";
      const { benchmarkInpaint } = (await import(
        path
      )) as typeof import("./inpaint-benchmark");
      return benchmarkInpaint(scope);
    }, scope);
    expect(result.rendering.completedMs.samples).toHaveLength(result.samples);
    if (result.timestamps)
      expect(result.profile?.gpuMs?.samples).toHaveLength(result.samples);
    const report = {
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      workingTreeChanged:
        execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim().length > 0,
      browser: browser.version(),
      platform: process.platform,
      kernel: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      flags: info.project.use.launchOptions?.args,
      ...result,
    };
    await writeFile(
      info.outputPath("timings.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        scope,
        firstRenderMs: result.firstRenderMs,
        completedMs: result.rendering.completedMs.median,
        p95: result.rendering.completedMs.p95,
        gpuMs: result.profile?.gpuMs?.median,
      }),
    );
  });
}
