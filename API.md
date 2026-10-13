# Control API

`window.openlight` is the browser entry point for the [controls](src/app/controls.ts). It acts on the current document with the same edits as the UI.

```js
const editor = window.openlight;
await editor.openFile(imageFile);
if (editor.getState().failure) throw new Error("Image could not be loaded.");

editor.setAdjustments({ exposure: 1, shadows: 25 });
editor.undo();
editor.redo();
const image = await editor.exportImage({ format: "jpeg", quality: 90 });
```

## Loading

These return promises; await them before editing. File arguments are browser `File`s.

| Method | Behavior |
| --- | --- |
| `openFile(file)` | Opens an image or scene file, imports a Camera Raw XMP file, or adds a LUT layer from a `.cube` file. |
| `openFiles(files)` | Opens the first image or scene file, then imports XMP and `.cube` files in order. |
| `loadImage(file)`, `loadScene(file)` | Replaces the document and its history. |
| `loadUrl(url)` | Fetches an image; another origin must allow CORS. |
| `importXmp(file)` | Applies supported Camera Raw adjustments as one edit. |
| `recoverDraft()`, `discardDraft()` | Opens or deletes the draft kept in the browser. |

File loads are queued and `loadUrl` starts at once; the last load started wins. Image, scene, and `.cube` failures do not reject: the open document, if any, stays with its history, and `getState().failure` names the file and error. Check `failure` to confirm success; a `documentId` may be the previous document's. Loading completion does not mean the preview has rendered.

## Editing

Commands take explicit layer IDs, never the UI selection. Without an ID, adjustments, the tone curve, and white balance address the image; effect setters use the first matching root effect or create one on top, as `addLayer` does. Values must be finite and in range; invalid input throws. Edits update the scene and history synchronously; rendering finishes later.

| Method | Arguments |
| --- | --- |
| `setAdjustments(change, id?)` | `exposure` −5…5; `contrast`, `highlights`, `shadows`, `whites`, `blacks`, `incrementalTemperature`, `incrementalTint`, `vibrance`, `saturation` −100…100. On the image or a mask. |
| `setToneCurve(points?, id?)` | `{ x, y }` points in 0…1, at least two, ordered by `x` at least `1/1024` apart; first at `x = 0` or `y = 0`, last at `x = 1` or `y = 1`. No points resets. |
| `setWhiteBalance(change?)` | RAW only: `temperature` 2000…25000 K, `tint` −150…150, each widened to include As Shot. No change restores As Shot. |
| `autoWhiteBalance()` | Neutralizes the color cast as one edit; resolves once made. |
| `setDetails(change, id?)` | `clarity` −100…100, `sharpening` 0…150, `sharpenRadius` 0.5…3. |
| `setColorMixer(color, change, id?)` | `color`: `red`, `orange`, `yellow`, `green`, `aqua`, `blue`, `purple`, `magenta`; `hue`, `saturation`, `luminance` −100…100. `resetColorMixer(id?)` resets all. |
| `setVignette(change, id?)` | `intensity`, `softness` 0…100. |
| `setGrain(change, id?)` | `amount`, `size`, `roughness` 0…100. |
| `setFill(change, id?)` | Color layer: `color` `#rrggbb`; `blend` `normal`, `multiply`, `screen`, `overlay`, `soft-light`, `color`, `luminosity`. |
| `addPaintStroke(id, stroke)`, `setPaintBlend(id, blend)` | Paint layer: a `BrushStroke` with a `#rrggbb` `color`; blends as `setFill`. |
| `addHealPatch(id, stroke, offset, mode?)` | Heal layer: returns the patch ID. `offset` is `[sourceX − targetX, sourceY − targetY]`; `mode` `"heal"` or `"clone"`. |
| `addRemovePatch(id, stroke)` | Heal layer: synthesizes the area from its surroundings; returns the patch ID. |
| `addHealStroke(id, patchId, stroke)`, `setHealSource(id, patchId, offset)` | Adds to a patch, or moves a Heal or Clone donor. |
| `setFrame(frame)` | Replaces the [ImageFrame](src/core/image/frame.ts): crop, rotation, flips, and `perspective` `[x, y]` −100…100. |

A `BrushStroke` has `mode` (`"paint"` or `"erase"`), `size` (diameter in source pixels), `feather` and `flow` (0…1), and `points` of `[x, y, pressure]` in source pixels, pressure 0…1. A photo holds up to 4 Paint layers and 10 brush masks.

## Layers

`scene.layers` is ordered bottom to top from the locked image at index 0; processing layers have `children`, two levels deep. The image's adjustments and curve develop the photo first; the layers above process that result in stack order. A mask applies its adjustments, curve, and child effects within its coverage × opacity. Mask children of a mask shape its coverage: Add, Subtract, or Intersect, in stored order. Hidden layers and zero opacity bypass their branch.

| Method | Behavior |
| --- | --- |
| `addLayer(kind, placement?)` | `"exposure"`, `"color-mixer"`, `"details"`, `"vignette"`, `"grain"`, `"fill"`, `"heal"`, `"paint"`, or `"mask"`; `{ inside: id }` or `{ above: id }`, else on top. Exposure starts at +1 EV, Vignette at intensity 50, Grain at amount 25, and Color at `#f0763c`; the rest start neutral. Selects and returns the ID. |
| `selectLayer(id)` | Selects a layer, without history. |
| `setLayer(id, change)` | `name`, `visible`, or `opacity` 0…1. |
| `setExposure(id, value)` | Exposure layer, −5…5 EV. |
| `setLayerMask(id, mask)` | `{ kind: "linear", start, end }`, `{ kind: "radial", center, radius, angle, feather }`, `{ kind: "brush", strokes }`, `{ kind: "luminance-range", low, high, smoothness }`, or `{ kind: "color-range", color, tolerance }`. Points and radii in source pixels, `angle` in degrees, `feather` 0…1; range values 0…100 with `low` ≤ `high`; `color` `null` until picked. |
| `setMaskOperation(id, operation)` | `"add"`, `"subtract"`, or `"intersect"` inside another mask. |
| `duplicateLayer(id)` | Copies a layer and its children above it; returns the new ID. |
| `moveLayer(id, index, parentId?)` | Moves to a final sibling index, bottom to top. |
| `deleteLayer(id)` | Removes a layer and its children. |

## History

Each content change is one undo step unless a group is open; groups do not nest. `beginEdit()` opens a group, `commitEdit()` records it, `cancelEdit()` restores the scene from before it, and `undo()`, `redo()`, selection, adding, duplicating, moving, and deleting layers, and the `reset` command commit an open group first. Finish async work before opening a group:

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

## Preview and export

`setPreview(change)` merges `comparison` (`"edited"`, `"original"`, `"split"`), `split` (0…1), `shadows`, and `highlights` (clipping, booleans), outside history and without validation.

`exportImage({ format, quality, longEdge })` returns a `File` without downloading it: `format` `"png"` (default), `"jpeg"`, or `"webp"`; `quality` 1…100, default 80; `longEdge` from 1 to the document's longest side. It renders its own full-resolution snapshot, unaffected by the preview. `exportScene()` returns the document as an `.openlight` scene file.

## State

`getState()` returns a detached snapshot: `file`, `failure`, `documentId`, `scene`, `selectedLayerId`, `size`, `frame`, `adjustments`, `whiteBalance`, `details`, `toneCurve`, `colorMixer`, `vignette`, `grain`, `preview`, and `history` (`undoCount`, `redoCount`, `editing`). Top-level values describe the image or the first matching root layer. Without a document, its fields are undefined and the settings are defaults.

## Commands

`run(command)` validates and runs one [command](src/app/commands.ts): a JSON object with a `type` and its fields. It returns `{ layerId }` for the layer it edited or created, or `{}`, and throws on an unknown type or invalid field.

```js
editor.run({
  type: "add-mask",
  mask: { kind: "linear", start: [600, 0], end: [600, 400] },
  adjustments: { exposure: -1 },
});
```

Types: `set-adjustments`, `set-tone-curve`, `set-white-balance`, `set-color-mixer`, `set-details`, `set-vignette`, `set-grain`, `add-mask`, `delete-layer`, `set-crop` (`aspectRatio?`, `straighten?` −45…45), `reset`, `undo`, `redo`, and `set-preview` (`comparison` only). Fields mirror the matching method's arguments, with `layerId` for the ID.

## WebMCP

In browsers with [WebMCP](https://webmachinelearning.github.io/webmcp/), in Chrome through an origin trial or `chrome://flags/#enable-webmcp-testing`, every command is a tool on `document.modelContext` with a JSON Schema from the same models. Tools return `{ layerId }` or `"Done."`; errors come back as text.

- `get-state` summarizes the file, size, frame, layers, comparison, and history.
- `open-image` opens an http(s) `url` like `loadUrl`, since tools carry no files; serve a local file over HTTP with CORS. From a public origin, Chrome's [Local Network Access](https://developer.chrome.com/blog/local-network-access) asks before the page reaches a local address.
- `run-commands` runs a list of commands in order, as `run` would one by one, and stops at the first error, keeping the ones before it.
