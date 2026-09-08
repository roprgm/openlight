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

TIFF import supports 8/16/32-bit unsigned samples and 16/32-bit floating-point HDR,
including strips, tiles, alpha, orientation, PackBits/LZW/Deflate and matrix/TRC
ICC profiles. JPEG-compressed TIFF, BigTIFF and ICC lookup-table profiles are
not supported. Untagged integer TIFF uses sRGB; floating-point TIFF needs a
profile or explicit primaries. Decoding lives in `src/lib/tiff`; samples stay
in linear Rec.2020 `rgba16float` through editing, with display clipping deferred.
