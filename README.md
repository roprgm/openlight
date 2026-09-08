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
- PNG and JPEG export

Requires a WebGPU-capable browser.

## Development

```sh
bun install
bun dev
```

Run `bun run check` to format and lint, `bun run build` to type-check and build, and `bun run test` for integration tests. GPU and UI tests run with `bun run test:browser` and require Chromium with WebGPU.

## Scripting

`window.openlight` exposes commands for loading, editing, undo/redo, and export. See the [API reference](API.md).

## License

[MIT](LICENSE)

TIFF import supports stripped 8/16-bit RGB and grayscale images, alpha,
uncompressed or ZIP/Deflate pixels, and matrix/TRC ICC profiles. Untagged
images use sRGB. LZW, PackBits, tiles, planar channels, rotated orientation tags,
HDR TIFF, BigTIFF and ICC lookup-table profiles are outside this small loader's scope.

`src/lib/formats/tiff/worker.ts` reads metadata with the MIT `tiff` package and decodes
strips using native browser streams. `color.ts` prepares ICC transforms using
`gl-matrix`; `index.ts` owns GPU upload and resources; `raster.wgsl` unpacks
samples and applies color conversion. Editing retains linear Rec.2020
`rgba16float` values, with display clipping deferred. Camera RAW is independent.
