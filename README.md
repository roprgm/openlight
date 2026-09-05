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
bun run check        # format + lint
bun run build        # typecheck + bundle
bun run test         # fast integration tests; no browser or GPU
bun run test:browser # pixels, UI, and codecs; requires Chromium + WebGPU
```

## License

[MIT](LICENSE)

## Browser controls

`window.openlight` is available after the app mounts, including production builds.
`createControls(gpu, workspace)` exposes the same commands without React. Each
document owns a vanilla Zustand scene store, an in-memory history, and image
resources. The scene contains canvas dimensions and an ordered list of image
layers, each with a source ID, adjustments, a tone curve, visibility, and opacity. Files and GPU targets stay outside scene snapshots. The workspace
currently opens one document at a time and replaces it when another image opens.
React hooks and context bind these instances to the UI; the renderer subscribes to its
explicit document.

```js
await openlight.openFiles([
  new File([imageBytes], "photo.png", { type: "image/png" }),
  new File([xmpText], "photo.xmp"),
]);
openlight.setAdjustments({ exposure: 1, saturation: -25 });
openlight.setAdjustments({ highlights: -50, shadows: 50, whites: 10, blacks: -10 });
openlight.undo();
openlight.redo();
const state = openlight.getState();
```

`openFiles` is shared by the app-wide drop handler, image picker, and browser
automation. Each batch opens the first recognized image, then applies all settings
files in their input order. Additional images are ignored without decoding them.
Camera Raw settings accept `.xmp` and `.xml` files containing the Camera Raw namespace.
Settings alone apply to the selected layer. Unsupported files and settings without
a loaded image are ignored; a failed image load skips that batch's settings.
Batches run sequentially, including calls through `openFile`, `loadImage`, and
`importXmp`, so settings cannot spill onto an image from a later batch.

`app/loaders/registry.ts` owns matching and batch ordering. Each loader declares
`kind`, `accepts`, and `load`; register loaders in `app/controls.ts`. The workspace
owns document replacement. Image decoding and XMP import remain separate from
scene state and history.

`beginEdit()`, `commitEdit()`, and `cancelEdit()` group synchronous editing commands.
Sliders and curve drags use the same grouping. Each text-field commit and XMP
import is one edit. Undo and redo restore content; a new edit discards redo.
History retains at most 100 small immutable scene snapshots in memory, sharing
unchanged data and excluding binary resources. Sources remain available while the
current scene or retained history references them, and are released afterward.
History resets with a new document.
Undo/redo buttons and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y are available;
text inputs keep native text undo. History is not persisted across reloads.

`setAdjustments` merges a partial update on the selected layer. Exposure accepts -5 to 5; other
adjustments accept -100 to 100. Loading another image resets adjustments.
The four tone controls follow Camera Raw XMP's units and direction. Each effect
is owned by its matching WGSL file in `src/lib/adjustments/`.
Whites and blacks move their endpoints along monotone cubic curves in perceptual
space, leaving middle gray fixed. At full strength the endpoint moves by 0.1.
Highlights and shadows use pointwise curves fitted against Lightroom exports;
they do not yet model Lightroom's spatial processing.
State includes the file name, document ID, canvas size, layers, selected layer ID,
the selected layer's adjustments and tone curve, and undo/redo counts. Loading commands resolve when their batch finishes; image
decoding failures appear in the editor. The renderer updates when the scene changes.

## Layers

Open an image to create a document. Use **Add image layer**, or drop images onto
its Layers panel, to add to that document. Dropping elsewhere still replaces it.
Layers render from bottom to top with normal blending in linear RGB. Added images
are centered and scaled down to fit the fixed canvas while keeping their aspect
ratio. Position and scale controls are not available yet.

Select a layer to edit its adjustments, curve, or opacity.
Double-click its name to rename it, use the eye button to toggle visibility, and
drag rows to change stacking order. Alt+Up/Down also reorders a focused row. These content
changes are undoable; selection itself is not. The main histogram shows the
composition, and the curve histogram shows the selected layer before its curve.
An empty document keeps its canvas and can accept another image layer.

PNG exports retain transparency. JPEG exports flatten onto white. The checkerboard
is only a preview background and is never exported.

```js
const id = await openlight.addImageLayer(new File([imageBytes], "layer.png"));
openlight.selectLayer(id);
openlight.setLayer(id, { name: "Foreground", opacity: 0.5, visible: true });
openlight.setAdjustments({ exposure: -1 }, id);
openlight.setToneCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }], id);
openlight.moveLayer(id, 0); // Bottom of the stack.
openlight.removeLayer(id);
openlight.undo();
```

Adjustment and curve commands accept an optional layer ID; otherwise they target
the selection. XMP imports keep the layer targeted when reading began, even if
selection changes while reading. Failed layer imports leave existing content intact.
