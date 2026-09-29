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

These methods return promises; await them before editing. All but `loadUrl`, which takes a URL, accept browser `File` objects.

| Method | Behavior |
| --- | --- |
| `openFile(file)` | Opens one image or [scene file](#scene-files), imports one Camera Raw XMP file, or adds a [LUT](#luts) layer from one `.cube` file. |
| `openFiles(files)` | Opens the first recognized image or scene file, then imports recognized XMP and `.cube` files in order. Unsupported files are ignored. |
| `loadImage(file)` | Loads a file as an image, replacing the current document and its history. |
| `loadScene(file)` | Opens a scene file as a new document, replacing the current one and its history. |
| `recoverDraft()` | Opens the stored [draft](#drafts) as a new document, like `loadScene`. Rejects when no draft is stored or storage fails. |
| `discardDraft()` | Deletes the stored draft and its source files. |
| `loadUrl(url)` | Fetches an image and loads it. A URL on another origin must allow CORS; the response's content type identifies an image whose URL has no extension. |
| `importXmp(file)` | Applies supported Camera Raw adjustments as one undoable edit. |

File loads are queued; `loadUrl` starts at once, and when two opens overlap the later one wins. XMP and `.cube` imports are skipped if no document is ready; an invalid XMP import can reject without blocking later loads. Image, scene, and `.cube` failures do not reject the loading promise. Without a document open, a failure leaves the workspace in its error state; with one, that document stays open and keeps its history. Either way `getState().failure` names the file and the error, and settings loaded in the same batch are skipped. Check `getState().documentId` or `failure` to confirm success. Loading completion does not guarantee the preview has rendered.

## Editing

Commands take explicit layer IDs rather than using UI selection. Without an ID, adjustments, the tone curve, and white balance address the base image; color-mixer, Details, vignette, and grain commands use the first matching root effect or create one at the top of the stack; effects nested in other layers stay untouched. Creation and parameter changes are one edit, respecting an open history group.

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

`setGrain({ amount, size, roughness }, id?)` updates a Grain layer, film grain in the style of Lightroom's. Values are finite numbers from 0 to 100; defaults are amount 0, size 25, and roughness 50. Without an ID, it updates the first Grain layer or creates one, which starts at amount 25 unless the change sets it. Amount 0 bypasses the effect. The particles lie at four fixed spacings, one to eight source pixels apart: size fades the finer ones out as the coarser ones come in, rather than stretching them, and roughness mixes in neighboring spacings and varies the particles' size, so 0 is even and 100 is clumped. The grain is fixed to source pixels before crop and rotation: zoom, pan, and crop do not move it, and a full-size export matches the preview; a smaller `longEdge` averages it like any fine detail. It moves luminance only, most in the midtones and fading toward black and white, scaling the channels equally so color holds, and leaves alpha and HDR headroom unchanged.

`setFill({ color, blend }, id?)` updates a Color layer: `color` is `#rrggbb` sRGB and `blend` is `normal`, `multiply`, `screen`, `overlay`, `soft-light`, `color`, or `luminosity`. The layer paints that color over the image below it, blended as Photoshop does on encoded values, so inside a brush or gradient mask it paints the mask's coverage; the layer's opacity sets the strength. Without an ID it updates the first Color layer or creates one, which starts at `#f0763c` in Normal.

Create an empty Heal effect with `addLayer("heal")`.

`addHealPatch(id, stroke, offset)` appends a Healing patch and returns its ID. `stroke` is a painted `BrushStroke`, and `offset` is `[sourceX - targetX, sourceY - targetY]` in source pixels. `setHealSource(id, patchId, offset)` changes a donor. Patches replay in order from the accumulated composite below; the tool supplies automatic donors.

For RAW sources, `setWhiteBalance({ temperature, tint })` sets absolute Kelvin and DNG tint, preserving unspecified values. Temperature accepts 2000–25000 K and tint accepts -150–150, extending either range to include the file's As Shot value. `setWhiteBalance()` restores that value (the decoder's daylight fallback if camera multipliers are unavailable). Non-RAW sources and invalid values throw. Incremental temperature/tint remain separate RGB adjustments.

`autoWhiteBalance()` neutralizes the photo's color cast as one edit and resolves once it is made. The GPU measures the cast of the source before any edit, as its edges' average color, so calling it again gives the same balance. A RAW photo's white balance moves from As Shot; any other photo's incremental temperature and tint are replaced. When another photo opens first, it resolves without an edit.

Edits update the scene and history synchronously. Rendering may finish later, particularly RAW development. Tests should wait for visible results; `exportImage()` renders and waits for its captured scene independently of the preview.

`setFrame(frame)` replaces the complete [ImageFrame](src/core/image/frame.ts) as an undoable edit. Geometry uses finite two-element coordinate pairs, positive dimensions, and nonzero scale. The frame is validated and copied; later changes to the supplied object do not affect the document.

## Layers

`scene.layers` is ordered bottom to top, beginning with the locked image at index 0. Processing layers have `children`, also ordered bottom to top; the image cannot contain layers. Editing supports two levels. Adding, duplicating, moving, and deleting commit an open gesture and record one history entry each. Selecting a layer changes the inspector without adding history; changing selection commits an active gesture. Removing the selected layer or an ancestor returns selection to the image.

Images own basic adjustments and a tone curve. Processing layers edit the source image in stack order; the image layer's adjustments and curve then tone the composite, so a local exposure can recover light that the global exposure pushes past white. An effect processes the image below, then its children. A mask processes its basic adjustments, its tone curve, and child effects, then blends that result with its input using coverage × opacity. A neutral mask with no effects does nothing. Hidden layers and zero opacity bypass the complete branch.

Direct mask children of another mask modify coverage instead of processing image pixels: Add sums coverage, Subtract removes it, clamping to 0–1 after each child in stored order. Each child's opacity scales its contribution. Its stored basic adjustments are inactive in this position. Other children process the image within the combined mask. Layer opacity always controls effect strength, preserving the input image's alpha.

| Method | Behavior |
| --- | --- |
| `addLayer(kind, placement?)` | Adds `"exposure"`, `"color-mixer"`, `"details"`, `"vignette"`, `"grain"`, `"fill"`, `"heal"`, or `"mask"`; selects and returns its ID. A `"lut"` layer comes from a `.cube` file instead. `{ inside: id }` appends a child to a processing layer; `{ above: id }` inserts directly above that layer among its siblings; without a placement, the layer goes on top of the root stack. Exposure starts at +1 EV, Vignette at intensity 50, Grain at amount 25; Color Mixer, Details, Healing, and masks start neutral. |
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

## LUTs

A LUT layer grades the image below it with a 3D lookup table, stored in the layer as `lut: { size, domain: [min, max], table }`: `table` holds `size`³ RGB triplets, red varying fastest, then green, then blue, for inputs spread evenly across the domain. The layer's opacity sets its strength.

`openFile` with an Adobe or Resolve `.cube` file adds one where the Add menu places effects, named after the file's `TITLE` or, without one, the file; the Add menu's LUT entry asks for such a file. The file needs `LUT_3D_SIZE`, a whole number from 2 to 65, before its rows. `TITLE`, `DOMAIN_MIN` and `DOMAIN_MAX` (default 0 and 1), or Resolve's `LUT_3D_INPUT_RANGE`, are read; comments, blank lines, and other keywords are skipped. 1D LUTs are rejected, and so is a file with too few or too many rows, naming the line where one is wrong.

Creative LUTs expect and return display-referred, sRGB-encoded color. The layer converts the working color as display does, into sRGB clipped to its gamut with hue and luminance kept, so headroom above white clips at the LUT; the color, clamped to the LUT's domain, is interpolated tetrahedrally between its entries, and the result, clamped to 0–1, converts back to the working space. The image layer's adjustments still apply after it, on the composite.

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

## Scene files

`exportScene()` returns `Promise<File>`: the document as an `.openlight` file named after its source image, which **Save scene** in the Export panel downloads. It is a ZIP archive holding the source file's original bytes at `sources/<id>` and a deflated `scene.json`:

```json
{
  "format": "openlight",
  "version": 1,
  "sources": { "<id>": { "name": "photo.jpg", "type": "image/jpeg" } },
  "scene": { "frame": {}, "layers": [] }
}
```

`scene` is the `getState()` scene; each image layer's `source` names an entry in `sources`. Opening the file with `loadScene`, `openFile`, a drop, or the file picker decodes the stored source again and restores the frame and every layer as a new document with empty history. Preview settings and history are not saved.

Opening validates every value as the matching command does, and a file that fails leaves the workspace in its error state with a message naming the first invalid field. Fields OpenLight does not know are dropped. A parameter missing from `adjustments`, `details`, `vignette`, `grain`, `fill`, or `colorMixer` takes its default, so older files still open when a group gains a parameter; a RAW image without a white balance uses its As Shot value. `version` increases only when older files can no longer open as written; a newer version is rejected.

## Drafts

Once a document has an edit, OpenLight keeps it as the draft in the browser's IndexedDB, so closing the tab loses nothing. A save follows 1.5 s after the last scene change and flushes when the tab is hidden or the page unloads; saves run one at a time and never render. Opening an image or scene without editing it keeps the previous draft. Only the latest document is kept.

A draft stores the same `scene.json` object a [scene file](#scene-files) holds, in a record with its own `version` and the document's name, while each source file sits in a separate store under its source ID. A save keeps source files already stored under their ID and deletes unreferenced ones in the same transaction, so edits never rewrite the photo.

On a fresh load the start screen shows a notice in the viewport's corner with **Recover** and **Forget**. `recoverDraft()` opens the draft through the same validation as a scene file, restoring each source under its original ID, with empty history; a newer draft `version` is rejected rather than dropped, and a parameter added to a group since takes its default. `discardDraft()` removes it. Both return `Promise<void>`. When IndexedDB is unavailable or fails, a dismissible notice suggests saving a scene file, and editing continues.

## State

`getState()` returns a detached snapshot containing `file`, `failure`, `documentId`, `scene`, `selectedLayerId`, `size`, `frame`, `adjustments`, `whiteBalance`, `details`, `toneCurve`, `colorMixer`, `vignette`, `grain`, `preview`, and `history`. `scene` contains `frame` and the layer tree. The top-level adjustment, tone-curve, and white-balance values come from `scene.layers[0]`; details, color-mixer, vignette, and grain values describe the first matching root layer from the bottom, or its defaults. `colorMixer` contains eight-value `hue`, `saturation`, and `luminance` arrays in the color order above, defaulting to zero. `whiteBalance` contains absolute temperature/tint for RAW sources and is undefined for other sources. `file` is the open document's filename, or without one the file loading or failed, `failure` is the last file that failed to open and its error until another opens or the notice is dismissed, and `history` contains `undoCount`, `redoCount`, and `editing`, which is true while a group is open.

Without a document, `documentId`, `size`, `frame`, and `preview` are undefined. Adjustments, details, and the tone curve use their defaults, and history counts are zero. Mutating the snapshot does not edit the document.

## Commands

`run(command)` validates and runs one command: a plain object with a `type` and that command's fields, as JSON can carry it. It returns `{ layerId }` for the layer the command edited or created, so a caller can select it, and throws on an unknown type or an invalid field. Commands make the same edits as the methods above.

```js
editor.run({
  type: "add-mask",
  mask: { kind: "linear", start: [600, 0], end: [600, 400] },
  adjustments: { exposure: -1 },
});
```

| Command | Fields | Behavior |
| --- | --- | --- |
| `set-adjustments` | adjustments, `layerId?` | Like `setAdjustments`. |
| `set-tone-curve` | `points?`, `layerId?` | Like `setToneCurve`. |
| `set-white-balance` | `temperature?`, `tint?` | Like `setWhiteBalance` with a change. |
| `set-color-mixer` | `color`, `hue?`, `saturation?`, `luminance?`, `layerId?` | Like `setColorMixer`. |
| `set-details` | `clarity?`, `sharpening?`, `sharpenRadius?`, `layerId?` | Like `setDetails`. |
| `set-vignette` | `intensity?`, `softness?`, `layerId?` | Like `setVignette`. |
| `set-grain` | `amount?`, `size?`, `roughness?`, `layerId?` | Like `setGrain`. |
| `add-mask` | `mask`, `adjustments?` | Adds a mask layer with those adjustments on top of the stack as one edit. |
| `delete-layer` | `layerId` | Like `deleteLayer`. |
| `set-crop` | `aspectRatio?`, `straighten?` | Replaces the frame with the largest centered crop of the source at `aspectRatio`, width over height, straightened by −45 to 45 degrees. Without either, it removes the crop. |
| `reset` | none | Removes every layer and returns adjustments, the tone curve, white balance, and the frame to how the photo opened, as one edit. |
| `undo`, `redo` | none | Like `undo` and `redo`. |
| `set-preview` | `comparison` | Shows `"edited"`, `"original"`, or `"split"`. |

## WebMCP

In browsers with [WebMCP](https://webmachinelearning.github.io/webmcp/), OpenLight registers every command as a tool on `document.modelContext`, so a browser agent can edit the open photo. Chrome offers WebMCP from version 149 through an origin trial or `chrome://flags/#enable-webmcp-testing`. A tool takes its command's fields, with a JSON Schema generated from the same models, and returns `{ layerId }` or `"Done."`; errors come back as text, so the agent can correct its input.

A read-only `get-state` tool returns the file, source size, frame, layers, comparison, and history, counting brush strokes, healing patches, and LUT table values rather than listing them.

WebMCP passes only JSON, so no tool takes or returns a file. `open-image` takes an http(s) `url` instead and opens it like `loadUrl`, in place of the open photo; it returns the new state like `get-state`, or why the image could not open. An agent opens a local file, such as an image attached to its chat, by serving it over HTTP with CORS and passing its URL. From a public origin such as openlight.app, Chrome's [Local Network Access](https://developer.chrome.com/blog/local-network-access) asks the user before the page reaches a local address; an automated browser can grant the `local-network-access` permission instead. When the request itself fails, the error names these causes, since the browser does not say which one it was.

`run-commands` takes `commands`, a list of objects shaped like `run`'s, and runs them in order in one call, so an agent can apply an edit of several steps without a round trip for each. Each command is its own undo step. It returns each command's result; at the first error it stops, names the failing command, and keeps the ones before it.
