import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import { expect, test } from "./fixtures";
import type { Workload } from "./rendering-benchmark";

for (const workload of [
  "neutral",
  "color-mixer",
  "vignette",
  "detail",
  "pipeline",
  "pipeline-input",
  "masked-exposure",
  "radial-exposure",
  "layer-stack",
] as const) {
  test(`rendering ${workload}`, async ({ page, browser }, info) => {
    await page.goto("/tests/gpu.html");
    const result = await page.evaluate(async (workload: Workload) => {
      const path = "/tests/rendering-benchmark.ts";
      const { benchmarkRendering } = (await import(
        path
      )) as typeof import("./rendering-benchmark");
      return benchmarkRendering(workload, [2400, 1600], 8, 40);
    }, workload);
    const { image, ...timings } = result;
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
      ...timings,
    };
    expect(report.rendering.completedMs.samples).toHaveLength(report.samples);
    if (report.timestamps) {
      for (const name of report.storage.passes) {
        expect(report.profile?.nodes[name]?.samples).toHaveLength(
          report.samples,
        );
      }
    }
    await writeFile(
      info.outputPath("timings.json"),
      JSON.stringify(report, null, 2),
    );
    await writeFile(info.outputPath("render.png"), new Uint8Array(image));
    await info.attach("render", {
      path: info.outputPath("render.png"),
      contentType: "image/png",
    });
    console.log(
      JSON.stringify({
        workload,
        firstRenderMs: report.firstRenderMs,
        completedMs: report.rendering.completedMs.median,
        gpuMs: report.profile?.gpuMs?.median ?? null,
        intermediateBytes: report.intermediateBytes,
      }),
    );
  });
}
