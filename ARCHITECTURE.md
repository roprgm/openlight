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
| `components/editor/brush-input.tsx` | Brush settings and the active input context. Brush and Healing own separate settings above the views; the canvas, cursor, menu, and shortcuts consume the active family. |
| `components/editor/brush-canvas.tsx`, `brush-cursor.tsx`, `brush-wheel.ts` | Shared brush gestures, cursor, and wheel input for color, masks, and retouch. Input batches each frame and flushes on release. Remove keeps a local contour outside document history and records one edit on release, including when moving a patch. Portaled controls retain their own input. Vertical wheel resizes the active brush and horizontal wheel is captured without panning; trackpad pinch and Space override return navigation to the viewport. The cursor adds a center cross above a 100 px visible diameter. |
| `features/heal/modes.ts` | Retouch names, descriptions, and order: Remove, Heal, Clone. The initial mode, desktop buttons, mobile tabs, and shortcut cycle share this order; choosing a mode is remembered across tool visits. |
| `app/editor/brush.tsx` | The Brush tool: one canvas that sends color or mask strokes to the feature edits its mode picks, and its options. |
| `app/editor/dock.tsx` | The mobile dock's tabs and what it shows: the layer stack, a tool's options, or the selected layer's dials. |
| `app/editor/renderer.ts` | Composes feature passes into the preview and export pipelines and tracks immutable upstream content for derived-image caches. |
| `app/editor/mask-overlay.tsx` | The only writer of the mask overlay, derived from the selection. |
| `app/editor/layers.ts` | The effect kinds the app offers and their layer factories. |
| `app/editor/export` | The export view. |
| `components/editor` | Editor primitives: layout, panel, dock, parameters, viewport, document and renderer contexts, brush input. |
| `components/ui` | What [`@roprgm/ui`](https://ui.roprgm.com) lacks; see [DESIGN.md](DESIGN.md). |
| `core/document` | Scene contract, layer tree, history, resources. |
| `core/image` | Image sources, decoding, geometry, color. |
| `core/renderer` | Render nodes, graph execution, masks, proxy, transform, display. |
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
- Expensive derived nodes can cache their result by explicit immutable content dependencies. A cache hit prunes the upstream branch; the graph owns at most two revisions per node, releases them with the composition instance, and reports them separately in `inspect()`. Hidden layers retain their instances, including descendant layers and Healing patches. The renderer adds RAW development revision and proxy factor to the keys; app composition supplies upstream content, and the feature supplies its own geometry. Feather and opacity do not invalidate a Remove patch's synthesis. Remove caches only its bounded correspondence field, at most 4 MiB per revision, and samples donor color during composition.
- The graph keeps intermediate textures for the last two sets of sizes it rendered, so interactive proxy renders and full renders alternate without reallocating full-size textures, which a phone's GPU memory cannot absorb gesture after gesture.
- Use `vgpu` for GPU work and `vgpu-react` for bindings. Create pipelines once per engine and reuse them. Keep `.wgsl` beside its owner.
- The working space is linear Rec.2020 in `rgba16float`. Decoders convert into it and display converts out; passes preserve format and primaries unless they explicitly convert.
- A LUT layer converts explicitly: its table expects display-referred sRGB, so it receives the working color as the display shows it, headroom above white clipped, and its output returns to linear Rec.2020.
- A node's storage arrays upload when the array changes; passing the same array, such as a LUT's table, keeps its buffer.
- The image layer's adjustments and tone curve develop the photo first; its children and the layers above process that result in stack order. Paint colors therefore follow the photo's adjustments. Working textures stay floating-point through composition; display and export encode the final result.
- Preserve HDR headroom through exposure, curves, and vibrance. Exposure multiplies linear RGB by `2^EV`, without clipping, so +3 EV followed by -3 EV recovers the original light even when intermediate values exceed 1.
- The adjustment shader's parameters use UI units; its fitted constants are calibration data.
- Strokes are scene content; the renderer caches their rasterized coverage, or a Paint layer's premultiplied 8-bit color, at half the source's resolution each way, a quarter of its pixels, which the passes that read them sample back to full size, and stamps only appended dabs. A Paint layer's raster comes with its first paint and stays, cleared if need be, until the layer goes, so painting and undoing allocate nothing. A photo holds up to 4 Paint layers and 10 brush masks.
- A mask's or Paint layer's latest stroke builds up in a half-float stroke buffer at the same resolution, one stroke at a time; its raster takes it in one pass when the next stroke starts, so it rounds to 8 bits once, however many moves drew it. Until then a Paint layer composes the buffer over its raster, and a mask's readers get its raster with the stroke laid over, in a view redrawn where the stroke grows. A Healing or Clone patch records its mode, reuses the same coverage, and keeps editable feather and opacity. Clone copies donor color directly, skipping the correction passes. A Healing patch's hard stroke rounds the same either way, so it stamps straight into a raster over only the 256 px tiles it reaches.
- Remove patches store a hard stroke without a donor offset. `features/heal/inpaint` builds a local, multiscale PatchMatch graph, entirely on the GPU: exclusion mask, preserved texture descriptors, nearest valid donor initialization, parallel propagation/random search, overlap voting, and final full-source sampling. Matching is bounded to a 512 px long edge; the output still samples the original source. The Heal compositor applies the patch's coverage, feather, and opacity. No processing depends on React or reads pixels to the CPU. See [the solver](src/features/heal/inpaint/algorithm.md) for its constraints and standalone benchmarks.
- A brush mask paints coverage as a Paint layer paints color: both are a painting, the latest strokes over settled pixels, in one raster module (r8 for coverage, rgba8 for color), which also owns the open stroke coverage view. The mask module combines that coverage with child masks. Gradient masks need no texture; the mix pass computes them. At 100 strokes, once no gesture is open, the renderer reads a painting's raster band by band through one mapped buffer, and the pixels, deflated, become a document resource the layer names in place of its strokes, without a history step. Rendering waits until both the scene and cached raster accept the settled pixels. History scenes name the pixels they drew over, so undo reaches past a settle: the renderer loads those pixels, inflating them band by band through a staging texture, and draws the strokes again. Resources go once no retained scene names them.
- Open history groups render a reduced proxy. Every render image carries `scale`, its source pixels per texel; shaders that take document coordinates or radii apply it.
- TIFF and camera RAW decode through `raw-webgpu`; OpenLight adapts its resources to document ownership.
