# Control API

`window.openlight` exposes the editor's commands while the app is mounted. Commands act on the current document. Load an image before editing or exporting.

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

Loading calls are queued. XMP import requires a loaded document and is skipped if none is ready. Image decoding failures appear in the workspace's error state and do not reject the loading promise. Check `getState().documentId` after loading to confirm a document is available.

## Editing

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

For RAW sources, `setWhiteBalance({ temperature, tint })` sets absolute Kelvin and DNG tint, preserving unspecified values. Temperature accepts 2000–25000 K and tint accepts -150–150, with either range extended to include the file's As Shot value. `setWhiteBalance()` restores the source's initial balance. When camera multipliers are unavailable, that initial balance is the decoder's daylight fallback. The command throws for non-RAW sources or invalid values. Edits enter history immediately; preview development runs asynchronously, and export waits for the captured scene's development. The incremental temperature/tint adjustments remain separate RGB adjustments.

`editScene(change)` shallowly merges a partial [Scene](src/lib/editor/scene.ts) into the document as an undoable edit. Supply complete values for nested fields such as `frame`. Prefer `setAdjustments` and `setToneCurve` for their validation.

## History

Each edit creates an undo step unless a group is open. Preview changes are outside history.

| Method | Behavior |
| --- | --- |
| `beginEdit()` | Starts a group. Subsequent edits appear immediately. |
| `commitEdit()` | Records the group as one undo step. |
| `cancelEdit()` | Restores the scene from before the group. |
| `undo()` | Commits any open group, then undoes one step. |
| `redo()` | Commits any open group, then redoes one step if available. |

## Preview

`setPreview(change)` updates only the supplied preview settings.

| Field | Values | Default |
| --- | --- | --- |
| `comparison` | `"edited"`, `"original"`, `"split"` | `"edited"` |
| `split` | Divider position from 0 to 1 | 0.5 |
| `shadows` | Show shadow clipping | `false` |
| `highlights` | Show highlight clipping | `false` |

## Export

`exportImage(options)` returns `Promise<File>` containing the edited image at the document's dimensions. Preview settings do not affect export.

- `exportImage()` or `exportImage({ format: "png" })` exports PNG.
- `exportImage({ format: "jpeg", quality: 90 })` exports JPEG. Quality must be between 1 and 100.

## State

`getState()` returns a detached snapshot containing `file`, `documentId`, `size`, `frame`, `adjustments`, `whiteBalance`, `toneCurve`, `preview`, and `history`. `whiteBalance` contains absolute temperature/tint for RAW sources and is undefined for other sources. `file` is the filename, and `history` contains `undoCount` and `redoCount`.

Without a document, `documentId`, `size`, `frame`, and `preview` are undefined. Adjustments and the tone curve use their defaults, and history counts are zero. Mutating the snapshot does not edit the document.
