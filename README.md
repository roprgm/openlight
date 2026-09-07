# OpenLight

**An open-source image editor for the browser, built with [vgpu.sh](https://vgpu.sh)**

Non-destructive editing, rendered on your GPU. Everything stays on your machine: no account, no upload.

## Features

- Light and color adjustments, tone curves, and Camera Raw XMP import.
- Crop, rotate, straighten, and flip, with undo/redo.
- Before/after comparison, RGB histograms, and clipping overlays.
- Pan and zoom, including Space + drag while cropping.
- PNG and JPEG export.

Requires a WebGPU-capable browser.

## Development

```sh
bun install
bun dev
```

```sh
bun run check        # format + lint
bun run build        # typecheck + bundle
bun run test         # browser-free integration tests
bun run test:browser # pixels, UI, and codecs; requires Chromium + WebGPU
```

## Scripting

`window.openlight` exposes the editor commands in the browser. `createControls(gpu, workspace)` provides the same API without React.

```js
await openlight.openFiles([imageFile, xmpFile]);
openlight.setAdjustments({ exposure: 1, shadows: 25 });
openlight.undo();
const image = await openlight.exportImage();
```

## License

[MIT](LICENSE)
