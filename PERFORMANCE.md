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
