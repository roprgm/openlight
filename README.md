# OpenLight

**An open-source photo editor for the browser, built with [vgpu.sh](https://vgpu.sh).**

Image processing runs locally with WebGPU. Built with TypeScript and React; requires a WebGPU-capable browser.

## Features

- Light and color adjustments, tone curves, clarity, and sharpening.
- Crop, rotate, straighten, flip, pan, and zoom.
- Undo/redo, before/after comparison, RGB histogram, and clipping overlays.
- Camera Raw XMP import; HEIC, TIFF at 16-bit and floating-point precision, and camera RAW/DNG with absolute white balance and As Shot reset.
- PNG, JPEG, and WebP export with resizing, live preview, and file size.

Documents currently live in memory; export saves a flattened image. Layers and Retouch modes are placeholders.

RAW decoding and GPU development use [raw-webgpu](https://github.com/roprgm/raw-webgpu), which documents format support and limitations. OpenLight owns editing, history and preview/export lifetimes.

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

[playwright.config.ts](playwright.config.ts) starts Vite automatically and selects Chromium's bundled SwiftShader on Linux, so browser tests can execute WebGPU on the CPU without a physical GPU or a separate SwiftShader installation. Use this configuration when testing; another browser session does not inherit its launch flags.

If the environment blocks local ports or browser processes, use its permitted execution mechanism. A launch failure or missing system library is an environment problem, not a shader failure.

### Validation

| Command | Checks |
| --- | --- |
| `bun run check` | Format and lint; writes fixes. |
| `bun run build` | Type-check and production build. |
| `bun run test` | Browser-free integration tests using real modules and `vgpu/mock`. |
| `bun run test:browser` | GPU pixels, UI, and codec integration in Chromium. |

Run all four after changes and before committing. [CI](.github/workflows/ci.yml) currently checks formatting/lint, Bun tests, and the build; it does not run browser tests.

During development, select an existing test by path:

```sh
bun run test tests/renderer.test.ts
bun run test:browser tests/rendering.e2e.ts --workers=1
```

One browser worker reduces CPU contention with SwiftShader. The mock does not execute shaders; use browser tests to check actual pixels. Reuse [browser fixtures](tests/fixtures.ts) and [image readers](tests/images.ts), and extend the [editing session](tests/editing.e2e.ts) for UI workflows.

## Scripting

`window.openlight` exposes commands for loading, editing, undo/redo, and export. See the [API reference](API.md).

## Contributing

- [AGENTS.md](AGENTS.md): architecture, ownership, coding rules, and completion requirements.
- [CONTEXT.md](CONTEXT.md): domain vocabulary.
- [REVIEW.md](REVIEW.md): review questions and actionable findings.
- [PERFORMANCE.md](PERFORMANCE.md): rendering measurements and the planned node instrumentation contract.

PRs include visual evidence and, when GPU work changes, a reproducible performance comparison. Use the [PR template](.github/pull_request_template.md).

## License

[MIT](LICENSE)

The bundled RAW decoder includes separately licensed libraries. See [NOTICE](NOTICE).
