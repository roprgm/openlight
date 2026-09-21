# Contributing

OpenLight is built with TypeScript, React, [vgpu](https://vgpu.sh), Bun, and Biome. [AGENTS.md](AGENTS.md) describes the architecture, ownership rules, and completion requirements; [CONTEXT.md](CONTEXT.md) holds the domain vocabulary; [REVIEW.md](REVIEW.md) guides reviews; [PERFORMANCE.md](PERFORMANCE.md) covers render nodes and performance measurements.

## Development

```sh
bun install
bun dev
```

### Browser setup

Install the Chromium version matching the project's Playwright dependency:

```sh
bunx --no-install playwright install --with-deps chromium
```

On Linux, installing system dependencies requires administrator access. If Chromium is already installed but libraries such as `libnspr4.so` are missing, run `bunx --no-install playwright install-deps chromium`. In environments without administrator access, use a browser environment with those dependencies supplied. See [Playwright's setup instructions](https://playwright.dev/docs/browsers#install-system-dependencies).

[playwright.config.ts](playwright.config.ts) starts Vite automatically and selects Chromium's bundled SwiftShader on Linux and Windows. Linux uses SwiftShader's Vulkan backend for image transfers and ANGLE's SwiftShader backend for canvas presentation. These tests execute WebGPU on the CPU without a physical GPU or a separate SwiftShader installation. Use this configuration when testing; another browser session does not inherit its launch flags.

If the environment blocks local ports or browser processes, use its permitted execution mechanism. A launch failure or missing system library is an environment problem, not a shader failure.

## Validation

| Command | Checks |
| --- | --- |
| `bun run check` | Format and lint; writes fixes. |
| `bun run build` | Type-check and production build. |
| `bun run test` | Browser-free integration and core unit tests using real modules and `vgpu/mock`. |
| `bun run test:browser` | GPU pixels, UI, and codec integration in Chromium. |

Run all four for code changes before committing. [CI](.github/workflows/ci.yml) checks formatting/lint, Bun tests, and the build; browser tests run locally.

During development, select an existing test by path:

```sh
bun run test tests/renderer.test.ts
bun run test:browser tests/rendering.e2e.ts --workers=1
```

One browser worker reduces CPU contention with SwiftShader. The mock does not execute shaders; use browser tests to check actual pixels. Reuse [browser fixtures](tests/fixtures.ts), [image readers](tests/images.ts), and existing [editing steps](tests/editing.e2e.ts). Follow the [testing guidance](AGENTS.md#tests-and-completion) to keep coverage proportional to the change.

The HEIC browser test reports a skip when the browser has no WebCodecs HEVC decoder.

## Scripting

`window.openlight` exposes commands for loading, editing, undo/redo, and export. See the [API reference](API.md).

## Pull requests

Code PRs include visual evidence: UI additions or changes require screenshots of the actual interface for visual review. GPU changes also need a reproducible performance comparison; [PERFORMANCE.md](PERFORMANCE.md#running-the-benchmark) explains how to run the benchmark. Use the [PR template](.github/pull_request_template.md) and the evidence rules in [AGENTS.md](AGENTS.md#tests-and-completion).
