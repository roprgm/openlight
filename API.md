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

Commands take explicit layer IDs rather than using UI selection. Without an ID, adjustments and white balance address the base image; curve, color-mixer, Details, and vignette commands use the first matching effect or create one at the top of the stack. Creation and parameter changes are one edit, respecting an open history group.

`setAdjustments(change, id?)` updates only the supplied adjustments on an image or mask. Values must be finite numbers within these inclusive ranges. Unknown names and invalid values throw.

| Adjustment | Range | Default |
| --- | --- | --- |
| `exposure` | -5 to 5 | 0 |
| `contrast`, `highlights`, `shadows`, `whites`, `blacks` | -100 to 100 | 0 |
| `incrementalTemperature`, `incrementalTint`, `vibrance`, `saturation` | -100 to 100 | 0 |

`setToneCurve(points, id?)` replaces a Curves layer's tone curve. Each point is `{ x, y }` with coordinates between 0 and 1. Supply at least two points, ordered by `x` with a minimum gap of `1/1024`. The first point must have `x = 0` or `y = 0`; the last must have `x = 1` or `y = 1`. Call `setToneCurve()` to reset it.

`setDetails(change, id?)` edits a Details effect: `clarity` (−100 to 100, default 0), `sharpening` (0 to 150, default 0), and `sharpenRadius` (0.5 to 3, default 1). Values must be finite. Like other effect commands, it creates a layer when no matching layer exists.

`setColorMixer(color, change, id?)` updates one of `red`, `orange`, `yellow`, `green`, `aqua`, `blue`, `purple`, or `magenta`. Supply any of `hue`, `saturation`, and `luminance`, each a finite number from -100 to 100. Other colors and unspecified channels keep their values. `resetColorMixer(id?)` resets every color in the matching layer as one undoable edit; without a matching layer it does nothing. A full shift of 100 rotates hue by 30°, scales saturation from zero to double, or moves luminance by one stop, weighted by each pixel's distance to the color's Oklab hue. Hue and saturation edits preserve luminance, and neutrals are unaffected.

`setVignette({ intensity, softness }, id?)` updates a vignette layer. Values are finite numbers from 0 to 100; defaults are intensity 0 and softness 50. Without an ID, it updates the first vignette or creates one. Intensity 0 bypasses the effect; increasing softness spreads the transition toward the center. The falloff stays centered on the source image before crop and rotation, independently of viewport zoom and pan. Its position among the effect layers determines processing order. It multiplies linear RGB equally and preserves alpha and HDR headroom.

For RAW sources, `setWhiteBalance({ temperature, tint })` sets absolute Kelvin and DNG tint, preserving unspecified values. Temperature accepts 2000–25000 K and tint accepts -150–150, extending either range to include the file's As Shot value. `setWhiteBalance()` restores that value (the decoder's daylight fallback if camera multipliers are unavailable). Non-RAW sources and invalid values throw. Incremental temperature/tint remain separate RGB adjustments.

Edits update the scene and history synchronously. Rendering may finish later, particularly RAW development. Tests should wait for visible results; `exportImage()` renders and waits for its captured scene independently of the preview.

`setFrame(frame)` replaces the complete [ImageFrame](src/core/image/frame.ts) as an undoable edit. Geometry uses finite two-element coordinate pairs, positive dimensions, and nonzero scale. The frame is validated and copied; later changes to the supplied object do not affect the document.

## Layers

`scene.layers` is ordered bottom to top, beginning with the locked image at index 0. Processing layers have `children`, also ordered bottom to top; the image cannot contain layers. Editing supports two levels. Selecting a layer changes the inspector without adding history; changing selection commits an active gesture. Removing the selected layer or an ancestor returns selection to the image.

Images own basic adjustments. An effect processes the image below, then its children. A mask processes its basic adjustments and child effects, then blends that result with its input using coverage × opacity. A neutral mask with no effects does nothing. Hidden layers and zero opacity bypass the complete branch.

Direct mask children of another mask modify coverage instead of processing image pixels: Add sums coverage, Subtract removes it, clamping to 0–1 after each child in stored order. Each child's opacity scales its contribution. Its stored basic adjustments are inactive in this position. Other children process the image within the combined mask. Layer opacity always controls effect strength, preserving the input image's alpha.

| Method | Behavior |
| --- | --- |
| `addLayer(kind, parentId?)` | Adds `"exposure"`, `"curves"`, `"color-mixer"`, `"details"`, `"vignette"`, or `"mask"`; selects and returns its ID. An explicit processing-layer parent appends a child; otherwise inserts above the selected sibling. Exposure starts at +1 EV, Vignette at intensity 50; Curves, Color Mixer, Details, and masks start neutral. |
| `selectLayer(id)` | Selects any layer. |
| `setLayer(id, change)` | Updates processing-layer `name`, `visible`, or `opacity` (0–1). |
| `setExposure(id, value)` | Sets an Exposure layer to -5…5 EV. |
| `setLayerMask(id, mask)` | Replaces a mask layer's gradient: `{ kind: "linear", start, end }` or `{ kind: "radial", center, radius, angle, feather }`. Geometry uses source pixels; radial angle is degrees and feather is 0–1. |
| `setMaskOperation(id, operation)` | Sets `"add"` or `"subtract"`; used when this mask is inside another mask. |
| `duplicateLayer(id)` | Copies a processing layer and its children above itself with independent IDs; selects and returns the new ID. |
| `moveLayer(id, index, parentId?)` | Moves to a final sibling index, bottom to top. Omit the parent for the root stack, where index 0 is reserved for the image. Image parents, cycles, and third-level nesting are rejected. |
| `deleteLayer(id)` | Removes a processing layer and its children; undo restores them. |

A linear gradient has full coverage at `start`, zero at `end`; its points must be finite and distinct. A radial gradient covers the ellipse inside `radius`, with positive radii and a feathered falloff toward its edge. Crop, rotation, and viewport navigation do not move it within the document.

The sidebar keeps four sections in every mode: output histogram, layers, controls, and footer. Layers and controls scroll independently; the histogram and footer stay fixed. **L** draws a linear mask; **R** draws a radial mask. Selected masks stay editable: drag the center to move, guides to resize or rotate, and the radial inner handle or Feather slider to soften its edge. Shift constrains drawing; Escape cancels the gesture; Delete/Backspace removes the selected mask. Each gesture is one undo. Add/Subtract menus accept either gradient shape. **+** adds an effect, inside a selected top-level mask or above the selected sibling. Eye buttons toggle visibility; the inspector edits opacity. Drag a layer name to reorder (insertion line) or nest (highlighted row); the base stays locked and nesting is limited to two levels. Double-click a name to rename; the row menu also duplicates, deletes, reorders, or reparents. Image import still replaces the document; multiple image layers and additional blend modes are not implemented.

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

`getState()` returns a detached snapshot containing `file`, `documentId`, `scene`, `selectedLayerId`, `size`, `frame`, `adjustments`, `whiteBalance`, `toneCurve`, `colorMixer`, `vignette`, `preview`, and `history`. `scene` contains `frame` and the layer tree. The top-level adjustment and white-balance values come from `scene.layers[0]`; curve, color-mixer, and vignette values describe the first matching layer in bottom-to-top depth-first order, or its defaults. `colorMixer` contains eight-value `hue`, `saturation`, and `luminance` arrays in the color order above, defaulting to zero. `whiteBalance` contains absolute temperature/tint for RAW sources and is undefined for other sources. `file` is the filename, and `history` contains `undoCount` and `redoCount`.

Without a document, `documentId`, `size`, `frame`, and `preview` are undefined. Adjustments and the tone curve use their defaults, and history counts are zero. Mutating the snapshot does not edit the document.
