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
| `loadUrl(url)` | Fetches an image from a same-origin URL and loads it. |
| `importXmp(file)` | Applies supported Camera Raw adjustments as one undoable edit. |

Loading calls are queued. XMP import is skipped if no document is ready; an invalid XMP import can reject without blocking later loads. Image decoding failures appear in the workspace's error state and do not reject the loading promise. Check `getState().documentId` to confirm success. Loading completion does not guarantee the preview has rendered.

## Editing

Commands take explicit layer IDs rather than using UI selection. Without an ID, adjustments, the tone curve, and white balance address the base image; color-mixer, Details, and vignette commands use the first matching root effect or create one at the top of the stack; effects nested in other layers stay untouched. Creation and parameter changes are one edit, respecting an open history group.

`setAdjustments(change, id?)` updates only the supplied adjustments on an image or mask. Values must be finite numbers within these inclusive ranges. Unknown names and invalid values throw.

| Adjustment | Range | Default |
| --- | --- | --- |
| `exposure` | -5 to 5 | 0 |
| `contrast`, `highlights`, `shadows`, `whites`, `blacks` | -100 to 100 | 0 |
| `incrementalTemperature`, `incrementalTint`, `vibrance`, `saturation` | -100 to 100 | 0 |

`setToneCurve(points, id?)` replaces the tone curve of an image or mask layer, applied after its basic adjustments. Each point is `{ x, y }` with coordinates between 0 and 1. Supply at least two points, ordered by `x` with a minimum gap of `1/1024`. The first point must have `x = 0` or `y = 0`; the last must have `x = 1` or `y = 1`. Call `setToneCurve()` to reset it.

`setDetails(change, id?)` edits a Details effect: `clarity` (−100 to 100, default 0), `sharpening` (0 to 150, default 0), and `sharpenRadius` (0.5 to 3, default 1). Values must be finite. Like other effect commands, it creates a layer when no matching layer exists.

`setColorMixer(color, change, id?)` updates one of `red`, `orange`, `yellow`, `green`, `aqua`, `blue`, `purple`, or `magenta`. Supply any of `hue`, `saturation`, and `luminance`, each a finite number from -100 to 100. Other colors and unspecified channels keep their values. `resetColorMixer(id?)` resets every color in the matching layer as one undoable edit; without a matching layer it does nothing. A full shift of 100 rotates hue by 30°, scales saturation from zero to double, or moves luminance by one stop, weighted by each pixel's distance to the color's Oklab hue. Hue and saturation edits preserve luminance, and neutrals are unaffected.

`setVignette({ intensity, softness }, id?)` updates a vignette layer. Values are finite numbers from 0 to 100; defaults are intensity 0 and softness 50. Without an ID, it updates the first vignette or creates one, which starts at intensity 50 unless the change sets it. Intensity 0 bypasses the effect; increasing softness spreads the transition toward the center. The falloff stays centered on the source image before crop and rotation, independently of viewport zoom and pan. Its position among the effect layers determines processing order. It multiplies linear RGB equally and preserves alpha and HDR headroom.

`setFill({ color, blend }, id?)` updates a Color layer: `color` is `#rrggbb` sRGB and `blend` is `normal`, `multiply`, `screen`, `overlay`, `soft-light`, `color`, or `luminosity`. The layer paints that color over the image below it, blended as Photoshop does on encoded values, so inside a brush or gradient mask it paints the mask's coverage; the layer's opacity sets the strength. Without an ID it updates the first Color layer or creates one, which starts at `#f0763c` in Normal.

Create an empty Heal effect with `addLayer("heal")`.

`addHealPatch(id, stroke, offset)` appends a Healing patch and returns its ID. The optional fourth engine argument chooses `"clone"` or `"ai"`; browser commands default to Smart clone. `stroke` is a painted `BrushStroke`, and `offset` is `[sourceX - targetX, sourceY - targetY]` in source pixels. `setHealSource(id, patchId, offset)` changes a donor. Patches replay in order from the accumulated composite below; the tool supplies automatic donors and AI results.

For RAW sources, `setWhiteBalance({ temperature, tint })` sets absolute Kelvin and DNG tint, preserving unspecified values. Temperature accepts 2000–25000 K and tint accepts -150–150, extending either range to include the file's As Shot value. `setWhiteBalance()` restores that value (the decoder's daylight fallback if camera multipliers are unavailable). Non-RAW sources and invalid values throw. Incremental temperature/tint remain separate RGB adjustments.

Edits update the scene and history synchronously. Rendering may finish later, particularly RAW development. Tests should wait for visible results; `exportImage()` renders and waits for its captured scene independently of the preview.

`setFrame(frame)` replaces the complete [ImageFrame](src/core/image/frame.ts) as an undoable edit. Geometry uses finite two-element coordinate pairs, positive dimensions, and nonzero scale. The frame is validated and copied; later changes to the supplied object do not affect the document.

## Layers

`scene.layers` is ordered bottom to top, beginning with the locked image at index 0. Processing layers have `children`, also ordered bottom to top; the image cannot contain layers. Editing supports two levels. Adding, duplicating, moving, and deleting commit an open gesture and record one history entry each. Selecting a layer changes the inspector without adding history; changing selection commits an active gesture. Removing the selected layer or an ancestor returns selection to the image.

Images own basic adjustments and a tone curve. Processing layers edit the source image in stack order; the image layer's adjustments and curve then tone the composite, so a local exposure can recover light that the global exposure pushes past white. An effect processes the image below, then its children. A mask processes its basic adjustments, its tone curve, and child effects, then blends that result with its input using coverage × opacity. A neutral mask with no effects does nothing. Hidden layers and zero opacity bypass the complete branch.

Direct mask children of another mask modify coverage instead of processing image pixels: Add sums coverage, Subtract removes it, clamping to 0–1 after each child in stored order. Each child's opacity scales its contribution. Its stored basic adjustments are inactive in this position. Other children process the image within the combined mask. Layer opacity always controls effect strength, preserving the input image's alpha.

| Method | Behavior |
| --- | --- |
| `addLayer(kind, placement?)` | Adds `"exposure"`, `"color-mixer"`, `"details"`, `"vignette"`, `"fill"`, `"heal"`, or `"mask"`; selects and returns its ID. `{ inside: id }` appends a child to a processing layer; `{ above: id }` inserts directly above that layer among its siblings; without a placement, the layer goes on top of the root stack. Exposure starts at +1 EV, Vignette at intensity 50; Color Mixer, Details, Healing, and masks start neutral. |
| `selectLayer(id)` | Selects any layer. |
| `setLayer(id, change)` | Updates processing-layer `name`, `visible`, or `opacity` (0–1). |
| `setExposure(id, value)` | Sets an Exposure layer to -5…5 EV. |
| `setLayerMask(id, mask)` | Replaces a mask layer's mask: `{ kind: "linear", start, end }`, `{ kind: "radial", center, radius, angle, feather }`, or `{ kind: "brush", strokes }`. Geometry uses source pixels; radial angle is degrees and feather is 0–1. |
| `setMaskOperation(id, operation)` | Sets `"add"` or `"subtract"`; used when this mask is inside another mask. |
| `duplicateLayer(id)` | Copies a processing layer and its children above itself with independent IDs; selects and returns the new ID. |
| `moveLayer(id, index, parentId?)` | Moves to a final sibling index, bottom to top. Omit the parent for the root stack, where index 0 is reserved for the image. Image parents, cycles, and third-level nesting are rejected. |
| `deleteLayer(id)` | Removes a processing layer and its children; undo restores them. |

A linear gradient has full coverage at `start`, zero at `end`; its points must be finite and distinct. A radial gradient covers the ellipse inside `radius`, with positive radii and a feathered falloff toward its edge. Crop, rotation, and viewport navigation do not move it within the document.

A brush mask is a list of strokes. Each stroke has `mode` (`"paint"` or `"erase"`), `size` (diameter in source pixels), `feather` and `flow` (0–1), and `points`, each `[x, y, pressure]` in source pixels with pressure 0–1. Dabs land every quarter diameter along the points; a paint stroke adds `flow × pressure` of the remaining coverage under each dab, and an erase stroke removes that share of the existing coverage. The renderer rasterizes strokes into a cached coverage texture at source resolution and only stamps new points, so appending to the last stroke is cheap and undo replays the rest. A brush inside another mask keeps its own coverage, paint and erase strokes alike, which the mask adds or subtracts scaled by the brush layer's opacity. A mask with no painted coverage and nothing added to it is bypassed.

The sidebar always shows the output histogram, the selected layer's controls, and the layer stack; layers and controls scroll independently. The rail holds tools: **A** Adjust, **H** Healing, **B** Brush, **L** Linear gradient, **R** Radial gradient, and **C** Crop; **E** opens Export from the header. A selected mask is *active*: the sidebar shows its adjustments and the bar its opacity. It is *edited* only while a shape tool is on the rail, which shows its guides or brush and the overlay; Adjust leaves the canvas to pan and zoom. Selecting a mask in the stack arms the tool of its shape; selecting the image or an effect returns to Adjust. **Enter**, or **Escape** with no drag in progress, leaves one level at a time: a shape tool returns to Adjust with the mask still selected, so its sliders stay at hand without guides over the image, and in Adjust the selection climbs to the parent mask, then to the image with its global controls. The shape's key or the mask's row enters editing again. Enter on a focused button stays its click. The bar over the image edits the active tool and the selected layer: the tool's options, then the layer's opacity, Overlay, and a radial mask's Feather or a child mask's operation. It never wraps: when the canvas is narrow it drops the slider bars, then moves the layer options and finally everything into a menu at its end. Dragging with a gradient tool draws a new mask above the selection; the tool stays active, and **Alt** while starting the drag subtracts the gradient from the selected mask instead. Choosing the Brush tool creates an empty brush mask above the selection at once, so adjustments made before the first stroke belong to it; leaving the tool while that mask has no strokes and nothing else changed removes it together with its history entry. A brush stroke paints into the selected brush mask, or starts a new brush mask. Creating inside a mask happens in the layer stack: each root mask row has Add and Subtract menus that choose a shape and nest the next mask inside it, and **Delete** removes the selected layer with any tool. The brush bar sets size, feather, flow, and paint or erase; **[** and **]** resize, holding **Alt** erases and shows Erase pressed, and **Escape** cancels the stroke. The brush cursor previews the dab's feather and remains visible while Size or Feather is edited. Creating the mask and each stroke are separate undo steps.

**H** enters Healing and creates an empty Healing layer unless one is selected. Strokes use Smart clone; with the `ai-remove` experiment on, the floating bar selects **Smart clone** or **AI Remove** for the next stroke. Size sets the next stroke and never resizes an existing patch. Healing keeps its own next-stroke Feather, initially 10%, without changing the Brush tool. A selected patch exposes editable Feather and Opacity; feather softens the accumulated hard-stroke shape inward from its contour rather than expanding it or feathering every dab independently. Smart clone chooses a nearby donor automatically; **Alt-click** sets it manually, and Automatic source clears the override. Its boundary correction is bounded to avoid extreme color gains and remains independent of Feather and Opacity. AI Remove sends a 512 px crop of the stroke and its surroundings to the local WebGPU inference runtime, stores the generated crop as a document resource, and blends it through the patch coverage. Its runtime and 28.1 MB model ship with OpenLight, stay out of the default bundle, and load on first selection; Cancel stops the download, and one prepared session serves subsequent patches while the editor stays open. A stroke's donor search or generation keeps its history group open, so Size, Feather, or a handle drag started meanwhile joins that stroke's undo step. AI patches receive the visible result of every earlier patch in their layer, so a second pass can remove an artifact introduced by the first. Editing or removing an earlier patch marks later AI results stale and regenerates them in replay order after the gesture. The sidebar numbers patches in replay order; drawing, selection, and row hover show their destination contour and first-point anchor. Dragging the destination anchor moves the shape while Smart clone keeps its source fixed; AI Remove shows its previous result during the gesture and regenerates affected AI patches in order after release. A completed Smart clone also shows a quieter source contour whose anchor changes the same donor coordinates as the panel. **Escape** cancels painting or pending processing; Enter leaves after completion. Leaving an untouched new layer removes it.

The red overlay shows a mask being edited that does not change the image yet: a gradient being drawn, or the selected mask while its adjustments and curve are default and its effects are off. Once the mask applies an effect, the image itself shows it, so painting continues without the tint. The Overlay button shows whether the overlay is visible; it and **O** show or hide the overlay for the selected mask in any tool, until another layer is selected. The tint follows the layer's opacity, which scales the mask's coverage. The curve's input histogram weighs pixels by that coverage, so it describes what the curve affects; it ignores opacity and stays available while the layer is hidden or at zero opacity. Selected masks stay editable: drag the center to move, guides to resize or rotate, and the radial inner handle or Feather slider to soften its edge. Shift constrains drawing; Escape cancels the gesture; Delete/Backspace removes the selected mask. Each gesture is one undo. A new mask shows a red overlay of its coverage until Enter leaves editing or its first adjustment; the overlay also shows while drawing or dragging a guide. Add/Subtract menus accept either gradient shape. **+** adds an effect, inside a selected top-level mask or above the selected sibling. Eye buttons toggle visibility; the inspector edits opacity. Drag a layer name to reorder (insertion line) or nest (highlighted row); the base stays locked and nesting is limited to two levels. Double-click a name to rename; the row menu also duplicates, deletes, reorders, or reparents. Image import still replaces the document; multiple image layers and additional blend modes are not implemented.

## Experiments

Features that are not ready for everyone are opted into by hand and remembered by the browser: open the editor with `?experiment=<name>` once to turn one on, or `?experiment=-<name>` to turn it off. The app composes an enabled experiment's feature; nothing else reads the setting.

| Experiment | Enables |
| --- | --- |
| `ai-remove` | The AI Remove algorithm in Healing, with its local inference runtime. Off by default while it is unstable on iOS. |

## History

Each content change creates an undo step unless a group is open. No-op edits add no history. Preview changes stay outside history. Groups do not nest. While a group is open, the preview renders a reduced proxy of the image at the display's scale; committing or cancelling renders the full image again.

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

`getState()` returns a detached snapshot containing `file`, `documentId`, `scene`, `selectedLayerId`, `size`, `frame`, `adjustments`, `whiteBalance`, `details`, `toneCurve`, `colorMixer`, `vignette`, `preview`, and `history`. `scene` contains `frame` and the layer tree. The top-level adjustment, tone-curve, and white-balance values come from `scene.layers[0]`; details, color-mixer, and vignette values describe the first matching root layer from the bottom, or its defaults. `colorMixer` contains eight-value `hue`, `saturation`, and `luminance` arrays in the color order above, defaulting to zero. `whiteBalance` contains absolute temperature/tint for RAW sources and is undefined for other sources. `file` is the filename, and `history` contains `undoCount`, `redoCount`, and `editing`, which is true while a group is open.

Without a document, `documentId`, `size`, `frame`, and `preview` are undefined. Adjustments, details, and the tone curve use their defaults, and history counts are zero. Mutating the snapshot does not edit the document.
