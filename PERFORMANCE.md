# Rendering performance

Changes to GPU work, such as shaders, pipelines, scheduling, or resource lifetimes, carry before/after measurements in the PR. Other changes need none.

## Measure the workload

1. Compare base and changed revisions with the same fixture, parameters, device, backend, and browser flags, and record the command that reproduces the result.
2. Separate setup and first render from repeated rendering. Warm up, then report sample count, median, and p95.
3. For a new effect, compare the previous workload with the changed revision's neutral or bypassed path, then report its active cost.
4. Check correctness alongside timing, and explain intentional tradeoffs.

| Measurement | Scope |
| --- | --- |
| CPU preparation | Encoding commands, measured with `performance.now()`. |
| GPU duration | Timestamped passes; a sum covers only the passes measured. |
| Completed-render latency | Time until submitted work completes; state what it includes. |

SwiftShader results describe that software backend only; do not extrapolate them to physical GPUs. If timestamps are unsupported, report GPU timing as unavailable rather than substituting CPU time.

## Timing and inspection

Enable the optional `timestamp-query` device feature, create a vgpu `timer(gpu)`, and pass it to `createRenderGraph` or `createEditorRenderer`; the graph times every node and results arrive through `timer.onResults`. `inspect()` on the graph reports executed passes, prepared effects, and retained intermediate textures. Interactive edits render a reduced proxy, so state the proxy factor when measuring them. See the [vgpu guide](https://github.com/vercel-labs/vgpu/blob/main/docs/topics/performance-playbook.docs.md#13-time-passes-before-optimizing-timer).

## Running the benchmark

Run `bun run test:browser --config playwright.bench.config.ts` apart from other browser work, and select a workload with `--grep`, e.g. `--grep 'rendering heal'`. Workloads and settings live in [the benchmark](tests/rendering-benchmark.ts): a deterministic 2400×1600 linear Rec.2020 fixture, 8 warmups, and 40 samples. Results and rendered PNGs go to `test-results/benchmarks`; attach them to the PR rather than committing them.

## Object removal

`bun run test:browser --config playwright.bench.config.ts --grep 'inpainting|rendering remove'` runs three headless workloads. `inpainting solver` measures a fresh local synthesis and mask raster without app composition; `inpainting editor` measures the same moving, 240 px patch in a 2400×1600 scene through `createEditorRenderer`, including the final blend. Both move the stroke one pixel each sample to require a new solve. `rendering remove` retains an unchanged stroke, measuring composition after the synthesis cache is populated. All use 8 warmups and 40 samples, separate first render and CPU encoding, and profile timestamps in a second run. None mounts React. Images are already resident on the GPU; decoding, display, and export are excluded.

Cached results appear as `cachedTextures` in `inspect()`; include them alongside `textures` when calculating memory. Remove caches a correspondence field rather than a full-resolution RGB crop (at most 4 MiB per revision). A full/proxy pair or the last two content revisions is bounded per patch; hiding the layer retains them, and removing the patch releases them. Matching uses a local grid capped at 512 px rather than scanning the whole photograph.
