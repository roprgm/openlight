# Control API

`window.openlight` is the browser entry point for the imperative [controls](src/app/controls.ts). It is available after the app initializes and acts on the current document. Load an image before editing or exporting. UI controls and this API use the same document edits.

## Example

With an image `File` named `imageFile`:

```js
const editor = window.openlight;
await editor.openFile(imageFile);
if (!editor.getState().documentId) throw new Error("Image could not be loaded.");

editor.setAdjustments({ exposure: 1, shadows: 25 });
editor.undo();
editor.redo();
const image = await editor.exportImage({ format: "jpeg", quality: 90 });
```

Export returns a `File`. It does not start a download.

## Loading

These methods accept browser `File` objects and return `Promise<void>`. Await them before editing.

| Method | Behavior |
| --- | --- |
| `openFile(file)` | Opens one image or imports one Camera Raw XMP file. |
| `openFiles(files)` | Opens the first recognized image, then imports recognized XMP files in order. Unsupported files are ignored. |
| `loadImage(file)` | Loads a file as an image, replacing the current document and its history. |
| `importXmp(file)` | Applies supported Camera Raw adjustments as one undoable edit. |

Loading calls are queued. XMP import is skipped if no document is ready; an invalid XMP import can reject without blocking later loads. Image decoding failures appear in the workspace's error state and do not reject the loading promise. Check `getState().documentId` to confirm success. Loading completion does not guarantee the preview has rendered.

## Editing

The adjustment, curve, color-mixer and white-balance commands edit the base image's Develop settings, independently of layer selection. Effect-layer commands take an explicit layer ID.

`setAdjustments(change)` updates only the supplied adjustments. Values must be finite numbers within these inclusive ranges. Unknown names and invalid values throw.

| Adjustment | Range | Default |
| --- | --- | --- |
| `exposure` | -5 to 5 | 0 |
| `contrast`, `highlights`, `shadows`, `whites`, `blacks` | -100 to 100 | 0 |
| `incrementalTemperature`, `incrementalTint`, `vibrance`, `saturation` | -100 to 100 | 0 |
| `clarity` | -100 to 100 | 0 |
| `sharpening` | 0 to 150 | 0 |
| `sharpenRadius` | 0.5 to 3 | 1 |

`setToneCurve(points)` replaces the tone curve. Each point is `{ x, y }` with coordinates between 0 and 1. Supply at least two points, ordered by `x` with a minimum gap of `1/1024`. The first point must have `x = 0` or `y = 0`; the last must have `x = 1` or `y = 1`. Call `setToneCurve()` to reset it.

`setColorMixer(color, change)` updates one of `red`, `orange`, `yellow`, `green`, `aqua`, `blue`, `purple`, or `magenta`. Supply any of `hue`, `saturation`, and `luminance`, each a finite number from -100 to 100. Other colors and unspecified channels keep their values. `resetColorMixer()` resets every color as one undoable edit. A full shift of 100 rotates hue by 30°, scales saturation from zero to double, or moves luminance by one stop, weighted by each pixel's distance to the color's Oklab hue. Hue and saturation edits preserve luminance, and neutrals are unaffected.

`setVignette({ intensity, softness }, id?)` updates a vignette layer. Values are finite numbers from 0 to 100; defaults are intensity 0 and softness 50. Without an ID, it updates the first vignette or creates one. Intensity 0 bypasses the effect; increasing softness spreads the transition toward the center. The falloff follows the document's output frame, including crop and rotation, independently of viewport zoom and pan. Its position among the effect layers determines processing order. It multiplies linear RGB equally and preserves alpha and HDR headroom.

For RAW sources, `setWhiteBalance({ temperature, tint })` sets absolute Kelvin and DNG tint, preserving unspecified values. Temperature accepts 2000–25000 K and tint accepts -150–150, extending either range to include the file's As Shot value. `setWhiteBalance()` restores that value (the decoder's daylight fallback if camera multipliers are unavailable). Non-RAW sources and invalid values throw. Incremental temperature/tint remain separate RGB adjustments.

Edits update the scene and history synchronously. Rendering may finish later, particularly RAW development. Tests should wait for visible results; `exportImage()` renders and waits for its captured scene independently of the preview.

`editScene(change)` shallowly merges a partial [Scene](src/core/document/scene.ts) as an undoable edit. Supply complete nested values such as `frame`. This low-level command validates frame geometry only; prefer the adjustment, curve, color-mixer, and white-balance commands for their validation.

## Layers

The base image is pinned below `scene.layers`, which are ordered bottom to top. Selecting a layer changes the inspector without adding history; changing selection commits an active edit gesture. Deleting the selected layer or undoing its creation returns selection to the base image.

| Method | Behavior |
| --- | --- |
| `addLayer(kind, mask?)` | Adds and selects `"exposure"` (+1 EV) or `"vignette"` (intensity 50, softness 50); returns its ID. |
| `selectLayer(id)` | Selects the base image or an effect. |
| `setLayer(id, change)` | Updates `name`, `visible`, or `opacity` (0–1). |
| `setExposure(id, value)` | Sets an exposure layer to -5…5 EV. |
| `setVignette(change, id)` | Updates the specified vignette layer. |
| `setLayerMask(id, mask?)` | Sets a linear gradient or removes the mask. |
| `duplicateLayer(id)` | Copies an effect above itself with independent parameters; selects and returns its new ID. |
| `moveLayer(id, index)` | Moves an effect to a zero-based index, bottom to top. |
| `deleteLayer(id)` | Removes an effect; undo restores it. |

A gradient is `{ start: [x, y], end: [x, y] }` in original document pixel coordinates: full effect at `start`, no effect at `end`. Points must be finite and distinct. Crop, rotation, and viewport navigation do not move the mask within the document. No mask means full coverage; coverage multiplies layer opacity. Hidden layers and zero opacity bypass processing.

In the UI, **Linear gradient** or **G** starts drawing and opens Adjust. Completing the drag creates a masked exposure layer as one undoable edit; Escape cancels it. The compact layer stack stays below the active editing inspector, including Crop. Selecting a layer opens its Adjust controls. Eye buttons toggle visibility, the header edits opacity, and double-clicking a layer name renames it.

## History

Each content change creates an undo step unless a group is open. No-op edits add no history. Preview changes stay outside history. Groups do not nest.

| Method | Behavior |
| --- | --- |
| `beginEdit()` | Starts a group. Subsequent edits appear immediately. |
| `commitEdit()` | Records the group as one undo step. |
| `cancelEdit()` | Restores the scene from before the group. |
| `undo()` | Commits any open group, then undoes one step. |
| `redo()` | Commits any open group, then redoes one step if available. |

Group related synchronous edits and cancel on failure. Finish asynchronous preparation before opening a group:

```js
editor.beginEdit();
try {
  editor.setAdjustments({ exposure: 0.5 });
  editor.setToneCurve([{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }]);
  editor.commitEdit();
} catch (error) {
  editor.cancelEdit();
  throw error;
}
```

## Preview

`setPreview(change)` merges the supplied preview settings without runtime validation. Use the values below.

| Field | Values | Default |
| --- | --- | --- |
| `comparison` | `"edited"`, `"original"`, `"split"` | `"edited"` |
| `split` | Divider position from 0 to 1 | 0.5 |
| `shadows` | Show shadow clipping | `false` |
| `highlights` | Show highlight clipping | `false` |

## Export

`exportImage(options)` returns `Promise<File>` containing the edited image, named after the source file. Preview settings do not affect export.

| Option | Values | Default |
| --- | --- | --- |
| `format` | `"png"`, `"jpeg"`, `"webp"` | `"png"` |
| `quality` | 1 to 100 for JPEG and WebP; PNG ignores it | 80 |
| `longEdge` | Longest output side in pixels, from 1 to the document's longest side | The document size |

The image renders at the document dimensions and downsamples to `longEdge` with high-quality smoothing. Invalid values throw, as does a format the browser cannot encode.

## State

`getState()` returns a detached snapshot containing `file`, `documentId`, `scene`, `selectedLayerId`, `size`, `frame`, `adjustments`, `whiteBalance`, `toneCurve`, `colorMixer`, `vignette`, `preview`, and `history`. `scene` contains `frame`, the base `image`, and ordered effect `layers`. The top-level Develop values are derived from `scene.image`; `vignette` describes the first vignette layer or its defaults. `colorMixer` contains eight-value `hue`, `saturation`, and `luminance` arrays in the color order above, defaulting to zero. `whiteBalance` contains absolute temperature/tint for RAW sources and is undefined for other sources. `file` is the filename, and `history` contains `undoCount` and `redoCount`.

Without a document, `documentId`, `size`, `frame`, and `preview` are undefined. Adjustments and the tone curve use their defaults, and history counts are zero. Mutating the snapshot does not edit the document.
