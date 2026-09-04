# OpenLight

**An open-source image editor for the browser, built with [vgpu.sh](https://vgpu.sh)**

Open a photo, adjust light and color, export the result. Edits are non-destructive and rendering runs on your GPU through WebGPU. Everything stays on your machine: no account, no upload.

Needs a WebGPU-capable browser: Chrome or Edge stable, Safari 26+.

## Run

```sh
bun install
bun dev
```

```sh
bun run check   # format + lint
bun run build   # typecheck + bundle
```

## License

[MIT](LICENSE)

## Browser controls

`window.openlight` is available after the app mounts, including production builds.
The UI, renderer, and browser API share the Zustand scene store in
`src/app/scene/index.ts`. The scene currently contains a source image and
adjustments. `app/editor/renderer/renderer.ts` executes the adjustment and display passes imperatively through
vgpu. `RendererProvider` owns the engine and frame loop; canvas and histogram
components attach their outputs through `useRenderer`. The API exposes application commands and scene actions:

```js
await openlight.openFiles([
  new File([imageBytes], "photo.png", { type: "image/png" }),
  new File([xmpText], "photo.xmp"),
]);
openlight.setAdjustments({ exposure: 1, saturation: -25 });
const state = // Or read immediately: openlight.getState()
```

`openFiles` is shared by the app-wide drop handler, image picker, and browser
automation. Each batch opens the first recognized image, then applies all settings
files in their input order. Additional images are ignored without decoding them.
Camera Raw settings accept `.xmp` and `.xml` files containing the Camera Raw namespace.
Settings alone apply to the current image. Unsupported files and settings without
a loaded image are ignored; a failed image load skips that batch's settings.
Batches run sequentially, including calls through `openFile`, `loadImage`, and
`importXmp`, so settings cannot spill onto an image from a later batch.

`app/loaders/registry.ts` owns matching, batch ordering, and the single-document
policy. Each loader declares `kind`, `accepts`, and `load`; register new loaders in
`app/controls.ts`. Image decoding and XMP import live in their own loaders. The
scene store owns document state and generic editing actions, without file loaders.

`setAdjustments` merges a partial update. Exposure accepts -5 to 5; other
adjustments accept -100 to 100. Loading another image resets adjustments.
State includes the file name and adjustments. Loading commands resolve when their
batch finishes; image decoding failures appear in the editor. The renderer runs every frame.
