# OpenLight

**An open-source image editor for the browser, built with [vgpu.sh](https://vgpu.sh)**

Image processing runs locally with WebGPU. Built with TypeScript and React.

## Features

- Light and color adjustments
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
