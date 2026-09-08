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
- Camera RAW import with editable temperature and tint
- Camera Raw XMP import
- TIFF import at 16-bit and floating-point precision, decoded on the GPU
- PNG and JPEG export

Requires a WebGPU-capable browser.

## Development

```sh
bun install
bun dev
```

Run `bun run check` to format and lint, `bun run build` to type-check and build, and `bun run test` for integration tests. Shader tests run with `bun run test:gpu`, and GPU and UI tests with `bun run test:browser`, which requires Chromium with WebGPU.

## Scripting

`window.openlight` exposes commands for loading, editing, undo/redo, and export. See the [API reference](API.md).

## License

OpenLight's own code is [MIT](LICENSE). Built with [vgpu](https://vgpu.sh)
(MIT, Vercel). Camera RAW decoding uses LibRaw 0.22.2 under CDDL 1.0. The
unmodified [source and license](https://www.libraw.org/data/LibRaw-0.22.2.tar.gz)
are available upstream. See [NOTICE](NOTICE).
