# Architecture

Where the code lives and the rules that keep it in place. Keep this file true: when a change moves a responsibility, update it in the same change.

## Map

| Path | Owns |
| --- | --- |
| `src/main.tsx` | Mounts the GPU provider and the app. |
| `app/index.tsx` | The app: workspace, file drop, draft notice. |
| `app/workspace` | The open document, its replacement, and loading state. A replacement loads beside the open document and takes its place only once it opens; a failure leaves the open document in place. |
| `app/loaders` | Image, scene file, and Camera Raw XMP loaders. |
| `app/draft` | The draft autosaved in the browser. |
| `app/controls.ts` | `window.openlight`, documented in [API.md](API.md). |
| `app/editor/index.tsx` | The editor with a document: header, then a tool's canvas and controls in the layout. A tool's `View` replaces both. |
| `app/editor/empty.tsx` | The editor before a document opens: welcome or loading status, and the placeholder sidebar. |
| `app/editor/sidebar.tsx` | Sidebar sections in order: `EditorSidebar` with a document, `PlaceholderSidebar` without one. |
| `app/editor/tools.tsx`, `tool-rail.tsx` | The tools and the desktop rail. A tool brings a `Canvas` overlay, `Options` for the bar over the image or the dock, or its own `View`. |
| `app/editor/dock.tsx` | The mobile dock's tabs and what it shows: the layer stack, a tool's options, or the selected layer's dials. |
| `app/editor/renderer.ts` | Composes feature passes into the preview and export pipelines. |
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
- State that outlives a layout, such as the tool, selection, camera, and history, lives above `EditorLayout`.

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
- UI controls and `window.openlight` call the same edits. A slider or curve gesture is one edit; cancelling restores the previous scene. Preview settings and navigation stay outside history.
- The engine owns GPU resources, rendering, and derived data such as histogram bins; frame data stays out of React state. Every resource owner disposes what it creates.

## Rendering

- `core/renderer` defines passes as nodes (`node`, `pipeline`, `split`, `merge`); the graph owns intermediate textures and timing. Features declare passes; `app/editor/renderer.ts` connects them.
- The graph keeps intermediate textures for the last two sets of sizes it rendered, so interactive proxy renders and full renders alternate without reallocating full-size textures, which a phone's GPU memory cannot absorb gesture after gesture.
- Use `vgpu` for GPU work and `vgpu-react` for bindings. Create pipelines once per engine and reuse them. Keep `.wgsl` beside its owner.
- The working space is linear Rec.2020 in `rgba16float`. Decoders convert into it and display converts out; passes preserve format and primaries unless they explicitly convert.
- Layers process in stack order; the image layer's adjustments and tone curve run last, on the composite.
- Preserve HDR headroom through exposure, curves, and vibrance. Exposure clips negatives and applies one luminance gain to all channels.
- The adjustment shader's parameters use UI units; its fitted constants are calibration data.
- Strokes are scene content; the renderer caches their rasterized coverage and stamps only appended dabs.
- Open history groups render a reduced proxy. Every render image carries `scale`, its source pixels per texel; shaders that take document coordinates or radii apply it.
- TIFF and camera RAW decode through `raw-webgpu`; OpenLight adapts its resources to document ownership.
