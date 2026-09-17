# OpenLight

**An open-source image editor for the browser, built with [vgpu.sh](https://vgpu.sh)**

Image processing runs locally with WebGPU. Built with TypeScript and React.

## Features

- Light and color adjustments
- Color Mixer with eight hue, saturation, and luminance ranges
- Tone curves
- Clarity and sharpening
- Crop, rotate, straighten, and flip
- Undo and redo
- Before/after comparison
- RGB histogram
- Highlight and shadow clipping overlays
- Pan and zoom
- Camera Raw XMP import
- TIFF import at 16-bit and floating-point precision, decoded on the GPU
- Camera RAW and DNG import through LibRaw, with absolute white balance and As Shot reset
- PNG, JPEG, and WebP export with resizing, a live preview, and file size

Requires a WebGPU-capable browser.

RAW decoding and GPU development use [raw-webgpu](https://github.com/roprgm/raw-webgpu), which documents format support and limitations. OpenLight owns editing, history and preview/export lifetimes.

## Development

```sh
bun install
bun dev
```

Run `bun run check` to format and lint, `bun run build` to type-check and build, and `bun run test` for integration tests. GPU and UI tests run with `bun run test:browser`, which requires Chromium with WebGPU.

## Scripting

`window.openlight` exposes commands for loading, editing, undo/redo, and export. See the [API reference](API.md).

## License

[MIT](LICENSE)

The bundled RAW decoder includes separately licensed libraries. See [NOTICE](NOTICE).

## Rendering benchmarks

Install the matching browser with `bunx --no-install playwright install --with-deps chromium`. The Playwright configuration uses SwiftShader's Vulkan backend on Linux for rendering and image transfers without a physical GPU.

Run `bun run test:browser --config playwright.bench.config.ts` separately from other GPU/browser work. It measures the renderer without the mixer, with neutral settings, and with all eight ranges active (hue 20, saturation 25, luminance 10). The fixture is a deterministic 2400×1600 linear Rec.2020 gradient containing neutrals, saturated colors, and HDR values; exposure is 0.25 and contrast is 10. Each workload uses 8 warmups and 40 measured samples.

Results and rendered PNGs are written under `test-results/benchmarks`. JSON includes environment details, individual samples, median/p95, renderer setup, first render, completed-render latency, and isolated mixer GPU timestamps when supported. Display, readback, and image encoding run outside the measured rendering loop. Software-adapter results describe that backend only.

For revision comparisons, run the same benchmark files and browser configuration in both checkouts. Revisions predating the mixer can run `--grep 'rendering baseline'`. The benchmark is opt-in and excluded from the regular test suite; correctness remains covered by the GPU pixel test and editing session.
