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
resources. The scene contains canvas dimensions, a source ID, adjustments, a tone curve, and non-destructive crop geometry. Files and GPU targets stay outside scene snapshots. The workspace
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
Settings alone apply to the current image. Unsupported files and settings without
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
unchanged data and excluding binary resources. It resets with a new document.
Undo/redo buttons and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y are available;
text inputs keep native text undo. History is not persisted across reloads.

`setAdjustments` merges a partial update. Exposure accepts -5 to 5; other
adjustments accept -100 to 100. Loading another image resets adjustments.
The four tone controls follow Camera Raw XMP's units and direction. Each effect
is owned by its matching WGSL file in `src/lib/adjustments/`.
Whites and blacks move their endpoints along monotone cubic curves in perceptual
space, leaving middle gray fixed. At full strength the endpoint moves by 0.1.
Highlights and shadows use pointwise curves fitted against Lightroom exports;
they do not yet model Lightroom's spatial processing.
State includes the file name, document ID, canvas size, adjustments, tone curve,
and undo/redo counts. Loading commands resolve when their batch finishes; image
decoding failures appear in the editor. The renderer updates when the scene changes.

## Preview aids

Click the split-view icon to compare the original on the left with the edit on the
right. Drag the vertical divider, use arrow keys, or double-click it to recenter.
Hold backslash for the full original; releasing restores the previous view.
Text fields keep normal keyboard input. The histogram's left and right triangles
toggle clipping overlays: blue for pixels with all sRGB channels at or below zero,
red for any channel at or above one. Transparent pixels are excluded.
These controls affect only the canvas; histograms and exports keep the edited result.
Preview settings reset when another image opens and never enter undo history.
Scripts can use `openlight.setPreview({ comparison: "split", split: 0.5 })` and
`openlight.setPreview({ shadows: true, highlights: true })`. Comparison accepts
`"edited"`, `"original"`, or `"split"`; the split position is a fraction from 0 to 1.

## Crop and rotate

Use the crop icon or press **C**. Drag the corners to resize the crop, drag inside
to move it, or use arrow keys on the focused selection or corner. The aspect selector
locks common ratios. Rotate turns clockwise by 90°; Straighten adjusts from -45°
to 45° and fills the frame automatically. Uncrop restores the full frame while
keeping rotation; Reset restores the original geometry.

Apply commits the entire crop session as one undo step. Escape or Cancel discards
the draft. Enter applies when focus is on the canvas. The source image stays intact,
so reopening the tool can recover cropped areas. Preview, comparison, histograms,
and export use the same geometry; exported dimensions follow the applied crop.

`openlight.setGeometry({ x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 90, angle: 2 })`
applies geometry imperatively. Rectangle coordinates are fractions of the oriented
image, rotation accepts 0/90/180/270 degrees, and angle is the straighten adjustment
in degrees. `openlight.setGeometry()` resets geometry. `getState()` includes geometry
and the resulting document dimensions.
