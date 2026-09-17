# Noise reduction measurements — PR 19

Compared main `ee4c0d7`, the previous PR head `ab901ec`, and the updated
implementation in this PR. Updated samples were collected before commit creation;
[raw results](noise-reduction.json) retain the original HEAD/dirty flags and a
production-source digest identifying the measured implementation.

Environment: Linux 7.0.0-31, AMD Ryzen 5 3600 (12 logical CPUs), Bun 1.3.14,
Chromium 151.0.7922.34, SwiftShader via software Vulkan. All runs use the same
flags from `playwright.config.ts`. No physical GPU was available.

## Repeated rendering

Times are milliseconds, **median / p95**, after 8 warmups with 40 completed
samples. The two fixture rows measure the production renderer offscreen through
queue completion, with exposure +0.25, contrast +10 and other adjustments neutral.
Active runs alternate the cached amount between 50 and 75. Initial decoding,
filter calculation, React, presentation, image encoding and timing readback are
outside this interval. GPU timing is unavailable for the full renderer here;
these completed latencies must not be presented as GPU timestamps.

| Workload | Main | Previous PR | Updated PR |
| --- | --- | --- | --- |
| RGB 257×193, neutral | 4.60 / 5.30 | 4.55 / 5.60 | 4.75 / 5.10 |
| RGB 257×193, cached amount 50/75 | — | 6.30 / 6.80 | 6.60 / 7.00 |
| Bayer 64×48, neutral | 2.30 / 2.40 | 2.30 / 2.40 | 2.30 / 2.40 |
| Bayer 64×48, cached amount 50/75 | — | 2.30 / 2.40 | 2.30 / 2.40 |
| Blend 5000×4000, GPU timestamps | — | 409.44 / 416.93 | 409.38 / 424.70 |
| Blend 5000×4000, completed latency | — | 410.80 / 417.80 | 410.75 / 426.30 |

The 20 MP case executes the production amount blend at 50% over two prefilled
linear Rec.2020 RGBA16F gradients. It measures one render pass and its 160 MB
output (about 153 MiB), excluding source textures. It does not run the expensive
20 MP denoiser or the complete 20 MP editor pipeline. All 40 GPU timestamp samples
were received; there is no missing blend coverage. Compute dispatches, sensor
processing and the other renderer passes are not individually timestamped.

The blend median changes by -0.01%.
Small-fixture median differences are under 0.4 ms and the measured distributions
overlap; they do not establish a speedup. The RGB active path adds a blend pass,
and neutral bypass adds none. These software results do not establish a hardware
FPS budget or predict hardware timing ratios. The 8.33 ms budget for 120 FPS still
requires measurement on a reference GPU.

## First use and correctness

A single diagnostic first-active sample, separate from the warmed measurements:

| Workload | Previous PR | Updated PR |
| --- | --- | --- |
| RGB 257×193 | 23693.5 ms | 24240.1 ms |
| Bayer 64×48 | 2023.7 ms | 1974.5 ms |

This interval includes filter setup/compilation, statistics readback, preparation,
filtering and the final render. For Bayer it also includes loading the private
sensor copy and developing it; the initial image load is recorded separately as
`decodeMs`. These single samples are not a latency distribution. The slow software
filter is intentionally cached, not recalculated for each amount change.

Shader bodies are unchanged by the reorganization; one relative color import
moves with its owner. Neutral exports match main exactly. Updated exports differ
from each previous PR's active exports by at most one 8-bit channel level on both
fixtures. Floating-point overlap accumulation uses atomics, so order can vary.
The independent browser tests verify noise error, color bias, detail, alpha and
zero bypass against clean fixtures. See `pixelComparison` in the raw report.

## Reproduction

```sh
bun install --frozen-lockfile
bun run test:browser --config playwright.bench.config.ts denoise.bench.ts
```

Artifacts are written under `test-results/benchmarks/`. Use the same browser,
backend and flags for both revisions; browser setup is in the root README.
To repeat the recorded comparison in isolated checkouts, copy these files from
this PR to each base: `tests/denoise-benchmark.ts`, `tests/denoise.bench.ts`,
`tests/gpu-timing.ts`, `tests/gpu.html`, `playwright.config.ts` and
`playwright.bench.config.ts`. Main also needs the two named noisy fixtures.
Install dependencies within each checkout so decoder workers remain inside its
Vite serving root.

On `ab901ec`, add the test-only compatibility file
`src/app/editor/renderer.ts` exporting `createRenderer as createEditorRenderer`
from `@/lib/editor/renderer`, and change the benchmark's dynamic blend import from
`/src/features/noise-reduction/processing/blend.ts` to `/src/lib/denoise/blend.ts`.
These adapt names only; leave all processing code unchanged. For main, run the
same command with `NR_BASELINE=1` to measure neutral rendering and skip the absent
blend. Run comparisons sequentially on an otherwise idle machine.

## Code size

Physical production lines in `src/` (`.ts`, `.tsx`, `.wgsl`, including comments
and blanks): the original PR added 1242 lines over `fccc4ca`;
the updated PR adds 1317 over `ee4c0d7`. The reorganization
therefore adds **75 net production lines**, excluding the color mixer merged from
main. Tests, benchmarks, documentation, licenses and binary fixtures are separate.
The added production code supplies the explicit preparation stage, feature-owned
lifecycle and generic private sensor copy; no new runtime dependency is introduced.
