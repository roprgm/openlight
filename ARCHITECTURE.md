# Architecture

Where the code lives and the rules that keep it in place. Keep this file true: when a change moves a responsibility, update it in the same change.

## Map

| Path | Owns |
| --- | --- |
| `src/main.tsx` | Mounts the GPU provider and the app. |
| `index.html`, `about.html` | The two pages. `index.html` holds the welcome's heading, visually hidden, for crawlers that don't run the script; `about.html` is static, without script. |
| `app/index.tsx` | The app: workspace, file drop, draft notice. |
| `app/workspace` | The open document, its replacement, and loading state. A replacement loads beside the open document and takes its place only once it opens; a failure leaves the open document in place. |
| `app/loaders` | Image, scene file, Camera Raw XMP, and `.cube` LUT loaders. A loader reads one file format and opens a document or edits the open one through the same edits the UI uses. |
| `app/draft` | The draft autosaved in the browser. |
| `app/controls.ts` | `window.openlight`, documented in [API.md](API.md). |
| `app/commands.ts` | The commands: serializable, validated edits that `run`, WebMCP, and other callers share; see [API.md](API.md#commands). |
| `app/webmcp.ts` | WebMCP tools for browser agents, one per command; see [API.md](API.md#webmcp). |
| `app/assistant` | Experimental chat that edits the photo, mounted only at `/?assistant`. `index.tsx` sends a message with a summary of the photo and runs the commands that come back; `jev.ts` asks the Jev evaluation model and turns its answers into commands. |
| `/api`, at the repository root | Vercel functions: `assistant.ts` answers the chat through `jev.ts`; `vercel dev` serves them locally. |
| `app/editor/index.tsx` | The editor with a document: header, then a tool's canvas and controls in the layout. A tool's `View` replaces both. Active brush subscriptions update their input context without rendering the layout. |
| `app/editor/empty.tsx` | The editor before a document opens: welcome or loading status, and the placeholder sidebar. |
| `app/editor/sidebar.tsx` | Sidebar sections in order: `EditorSidebar` with a document, `PlaceholderSidebar` without one. |
| `app/editor/tools.tsx`, `tool-rail.tsx` | The tools and the desktop rail. A tool brings a `Canvas` overlay, `Options` for the bar over the image or the dock, or its own `View`. |
| `app/editor/tool-shortcuts.tsx` | Group shortcuts: return to a tool's remembered mode, then cycle its available modes while it is active. |
| `components/editor/brush-input.tsx` | Brush settings and the active input context. Brush and Healing own separate settings above the views; the canvas, cursor, menu, and shortcuts consume the active family. Size is a viewport diameter independent of image resolution and zoom. `BrushCanvas` converts it to source pixels once at stroke start, covering the same area there under perspective; recorded strokes retain their image-space geometry, round in source pixels, and the cursor shows the dab as the viewport does. |
| `components/editor/mapping.ts` | Viewport ↔ document positions through the frame, perspective included, for every canvas tool: exact both ways, with source circles and polygons drawn as their exact images. Pointer input stops at a straight line short of the correction's horizon, joining a stroke that crosses it along that line; a shape the viewport cannot show whole is clipped where it leaves the viewport. |
| `components/editor/brush-canvas.tsx`, `brush-cursor.tsx`, `brush-wheel.ts` | Shared brush gestures, cursor, and wheel input for color, masks, and retouch. Input batches each frame and flushes on release. Remove and modifier edits keep a local contour outside document history and record one edit on release; Remove also previews destination moves until drop. Modifiers and the release policy are latched at gesture start; the retouch feature owns their meaning. Portaled controls retain their own input. Vertical wheel resizes the active brush and horizontal wheel is captured without panning; trackpad pinch and Space override return navigation to the viewport. The cursor adds a center cross above a 100 px visible diameter. |
| `features/heal/modes.ts` | Retouch names, descriptions, and order: Remove, Heal, Clone. The initial mode, desktop buttons, mobile tabs, and shortcut cycle share this order; choosing a mode is remembered across tool visits. |
| `app/editor/brush.tsx` | The Brush tool: one canvas that sends color or mask strokes to the feature edits its mode picks, and its options. |
| `app/editor/dock.tsx` | The mobile dock's tabs and what it shows: the layer stack, a tool's options, or the selected layer's dials. |
| `app/editor/renderer.ts` | Composes feature passes into the preview and export pipelines. |
| `app/editor/mask-overlay.tsx` | The only writer of the mask overlay, derived from the selection. |
| `app/editor/layers.ts` | The effect kinds the app offers and their layer factories. |
| `app/editor/export` | The export view. |
| `components/editor` | Editor primitives: layout, panel, dock, parameters, viewport, document and renderer contexts, brush input. |
| `components/ui` | What [`@roprgm/ui`](https://ui.roprgm.com) lacks; see [DESIGN.md](DESIGN.md). |
| `core/document` | Scene contract, layer tree, history, resources. |
| `core/image` | Image sources, decoding, geometry, color. |
| `core/renderer` | Render nodes, graph execution, masks, Remove fields, proxy, transform, display. |
| `features/<name>` | One capability: usually `model.ts` (parameters, defaults), `edits.ts`, `pass.ts` with its `.wgsl`, and `controls.tsx`. |
| `lib` | Utilities independent of OpenLight. |
| `tests` | `*.test.ts` run in Bun with `vgpu/mock`; `*.e2e.ts` run in Chromium; `fixtures/` holds test images. |

## Layouts

`useDesktopLayout` in `components/editor/layout.tsx` is the one switch between two layouts, read from the same media query as Tailwind's `md` (768 px), so a class and the tree change in the same frame. Every view renders an `EditorLayout` with its canvas and controls, inside an `EditorFrame` that outlives the views: rail, canvas, and sidebar in a row on desktop; canvas, dock, and tab bar in a column on mobile. The app supplies the rail and the tab bar to the frame.

- The canvas keeps its place in both layouts, so crossing the breakpoint moves it without mounting it again. The sidebar and the dock swap; neither mounts hidden, since each subscribes to the document and the histogram reads the GPU.
- Features describe numbers as `Parameter`s drawn as sliders in the sidebar and dials in the dock, and other controls once for both. Composition that differs sits beside its desktop form: `AdjustPanel` and `AdjustDock`, or a tool's `Options` under the `dock` density.
- State that outlives a layout, such as the tool, selection, camera, history, and each brush family's size and feather, lives above `EditorLayout`. Brush settings last for the document and stay outside history.

## Layers

| Layer | Owns |
| --- | --- |
| 0 — `lib/` | Code independent of OpenLight that could be a standalone library. Being shared or React-free does not qualify code for `lib/`. |
| 1 — `core/`, `components/`, `hooks/` | Document, image, and renderer infrastructure without React; UI primitives and React bindings above it. |
| 2 — `features/` | Removable product capabilities: processing, shaders, parameters, edits, and controls. Most product behavior belongs here. |
| 3 — `app/` | The shell, entry points, and explicit composition of features. |

Dependencies point downward. Features do not import each other; `app/` connects them. Shared primitives do not import features. Keep module internals private and add no application-wide barrel.

## Engine and React

- Document edits and rendering run without React, a mounted UI, or an implicit active document: pass workspace, document, and GPU explicitly. Feature processing imports without its panel.
- Each document owns a vanilla Zustand scene store, history, and image resources. Scenes hold immutable, serializable content and image-source IDs; files and GPU resources stay outside history.
- UI controls, `window.openlight`, and commands call the same edits. A slider or curve gesture is one edit; cancelling restores the previous scene. Preview settings and navigation stay outside history.
- The engine owns GPU resources, rendering, and derived data such as histogram bins; frame data stays out of React state. Every resource owner disposes what it creates.

## Assistant

- The model, how it is asked, and its key stay on the server. The browser sends a message and a summary of the photo, and receives commands and a message, so another model can answer without changing the client.
- `protocol.ts` validates both directions. Vercel runs `api/assistant.ts` unbundled in Node, so the modules it reaches import app modules only as types, and its own imports name their `.js` output instead of using `@/`.

## Rendering

- `core/renderer` defines passes as nodes (`node`, `pipeline`, `split`, `merge`); the graph owns intermediate textures and timing. Features declare passes; `app/editor/renderer.ts` connects them.
- Hidden layers retain their composition instances, including descendant layers and Healing patches.
- The graph keeps intermediate textures for the last two sets of sizes it rendered, so interactive proxy renders and full renders alternate without reallocating full-size textures, which a phone's GPU memory cannot absorb gesture after gesture.
- Use `vgpu` for GPU work and `vgpu-react` for bindings. Create pipelines once per engine and reuse them. Keep `.wgsl` beside its owner.
- The working space is linear Rec.2020 in `rgba16float`. Decoders convert into it and display converts out; passes preserve format and primaries unless they explicitly convert.
- A LUT layer converts explicitly: its table expects display-referred sRGB, so it receives the working color as the display shows it, headroom above white clipped, and its output returns to linear Rec.2020.
- A node's storage arrays upload when the array changes; passing the same array, such as a LUT's table, keeps its buffer.
- The image layer's adjustments and tone curve develop the photo first; its children and the layers above process that result in stack order. Paint colors therefore follow the photo's adjustments. Working textures stay floating-point through composition; display and export encode the final result.
- Preserve HDR headroom through exposure, curves, and vibrance. Exposure multiplies linear RGB by `2^EV`, without clipping, so +3 EV followed by -3 EV recovers the original light even when intermediate values exceed 1.
- The adjustment shader's parameters use UI units; its fitted constants are calibration data.
- Strokes are scene content; the renderer caches their rasterized coverage, or a Paint layer's premultiplied 8-bit color, at half the source's resolution each way, a quarter of its pixels, which the passes that read them sample back to full size, and stamps only appended dabs. A Paint layer's or brush mask's raster comes with its first paint and stays, cleared if need be, until the layer goes, so painting and undoing allocate nothing. A photo holds up to 4 Paint layers and 10 brush masks.
- A mask's or Paint layer's latest stroke builds up in a half-float stroke buffer at the same resolution, one stroke at a time; its raster takes it in one pass when the next stroke starts, so it rounds to 8 bits once, however many moves drew it. Until then a Paint layer composes the buffer over its raster, and a mask's readers get its raster with the stroke laid over, in a view redrawn where the stroke grows. A Healing or Clone patch records its mode, reuses the same coverage, and keeps editable feather and opacity. Clone copies donor color directly, skipping the correction passes. A Healing patch records ordered hard paint/erase strokes, stamped through the shared GPU brush engine into one raster over only the 256 px tiles its paint reaches. Appending a gesture stamps only new dabs; undo or moved geometry replays the sequence. Shift adds and Alt/Option subtracts on the selected patch, preserving its donor and blend; separate strokes stay separate. The local SVG preview composes the same ordered operations and shows union boundaries and erased holes. Scene loading migrates earlier single-stroke patches once at the boundary.
- Remove patches store hard paint/erase strokes without a donor offset. `features/heal/inpaint` synthesizes a field of each hole texel's offset to its donor with a local, multiscale PatchMatch graph, entirely on the GPU: exclusion mask, preserved texture descriptors, nearest valid donor initialization, parallel propagation/random search, and overlap voting. Matching is bounded to 512 texels along the long side; the output samples donors at full source resolution. The Heal compositor applies the patch's coverage, feather, and opacity.
- A Remove field is synthesized once per stroke version and kept. Each edit that changes a Remove patch's strokes reserves a new field in the document's resources, naming the field it extends, and the patch names it, so every scene with those strokes, in history, drafts, scene files, and exports, shows one fill however late it arrives; filling it never changes the scene or history. The renderer keeps fields by ID: it synthesizes a waiting one once, at full resolution, from the image below, extending the nearest field it names that it holds or the document saved, and reads it back for the document at once, rendering nothing meanwhile. Patches that share a field, such as duplicates, share its synthesis. The layers below, a proxy, hiding, undo, export, and a reopened scene all use that field and never solve again; a version never shown synthesizes when it first shows. Export, scene files, and drafts complete their snapshot with the fields the editor shows that the document still waits for, and fail when that readback fails. Composition samples donor color from the current image below, so the patch follows changes under it, such as exposure. A stroke added to or erased from the patch keeps the texels the earlier field filled, on the same lattice while it fits, as long as they stay in the hole and their donors stay clean, and synthesizes only the rest; moving the patch synthesizes it anew. Synthesis needs no React. See [the solver](src/features/heal/inpaint/algorithm.md) for its constraints and standalone benchmarks.
- A brush mask paints coverage as a Paint layer paints color: both are a painting, the latest strokes over settled pixels, in one raster module (r8 for coverage, rgba8 for color), which also owns the open stroke coverage view. At 100 strokes, once no gesture is open, the renderer reads a painting's raster band by band through one mapped buffer, and the pixels, deflated, become a document resource the layer names in place of its strokes, without a history step. Rendering waits until both the scene and cached raster accept the settled pixels. History scenes name the pixels they drew over, so undo reaches past a settle: the renderer loads those pixels, inflating them band by band through a staging texture, and draws the strokes again. Resources go once no retained scene names them.
- A mask that only gradients shape needs no texture: the mix pass computes it, children included. A mask with a painted brush or a range combines in the render graph: each child's coverage, a brush's cached raster, a gradient drawn by a node, or a range read from the image below the mask, folds into the group's in stored order through one combine pass, and the mix pass shares its add, subtract, and intersect. The group takes the image's resolution when a range takes part, since a range follows the photo's edges, and the brushes' otherwise. The renderer gives it out, with each range's own coverage, for the overlay and thumbnails. While a color is picked, renders also keep the image below the mask group, which the picker reads through one GPU pass and 16 bytes of readback per pick.
- Open history groups render a reduced proxy. Every render image carries `scale`, its source pixels per texel; shaders that take document coordinates or radii apply it.
- The scene's frame maps output to source in one homogeneous transform, `frameTransform` in `core/image/frame.ts`: crop, rotation, flips, and scale, then the perspective correction about the source's center. Layers, paint, masks, and patches stay in source pixels, so correcting perspective leaves them in place; `transformImages` resamples the composite and the original once, the display and mask overlay use the same transform, and a frame that changes nothing adds no pass. The proxy follows the frame's strongest magnification, perspective's included. `lib/projective.ts` holds the plane projective geometry the frame, the Crop tool's coverage, and the canvas mapping share.
- TIFF and camera RAW decode through `raw-webgpu`; OpenLight adapts its resources to document ownership.
