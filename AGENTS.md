# OpenLight

A Vite, React, and vgpu app. Bun for install and scripts. Biome for format and lint.

Demonstrate a professional photo editor with little, readable code.

`src/main.tsx` owns runtime and provider composition.

Write committed code, comments, documentation, and UI text in English. Research drafts may use another language while uncommitted.
Use `CONTEXT.md` for document, scene, and image-source terminology.

## Size

Keep each file focused on one responsibility and one abstraction level. Entry points compose; providers, hooks, and domain modules own lifecycles and policy.
Start with direct functions and thin UI composition. Add a layer only when it owns a distinct responsibility or removes duplication.
Evaluate simplicity across the whole feature, including lifecycle code and consumers. Keep cohesive work together; moving lines into forwarding helpers is not a reduction.
Prefer direct vgpu operations. Add wrappers, validation, scheduling, or caching only for a current requirement.
One component per responsibility: when a component holds state or refs that only part of its markup uses, extract that part into its own component. Within a file, define a function above the function that uses it.

## Engine and React

React owns UI composition, controls, and mounting engine outputs. Commands perform decoding and other processing imperatively, with explicit workspace or document dependencies. The engine owns GPU resources, rendering, and derived data such as histogram bins; frame data stays outside React state and props.

Hooks and providers connect stable imperative instances to mounting and cleanup. Each resource owner disposes what it creates. Canvas and histogram components attach engine outputs to the UI.

Each document owns a vanilla Zustand scene store, history, and image resources. The scene contains serializable data and refers to image sources by ID; files and GPU targets stay outside history. The workspace owns document replacement and loading state. UI interactions and browser commands use the same imperative edits; history groups them without knowing loaders or tools.

## Structure

Prefer named exports (`export function`) and named imports. Use default exports only when a concrete integration requires or clearly benefits from them, such as a worker loader or dynamic-import consumer that expects a default export.

The `src/` root holds entrypoints, ambient types, and global styles. Import across folders through the `@/` alias (`@/hooks/use-pointer`); relative paths stay inside a folder. Source modules belong to these folders:

- `app/`: application shell, app-wide state, and composition. It may import every folder below; no folder imports it.
- `features/`: removable product capabilities. A feature owns its UI, state, and behavior; removing its folder and `app/` composition leaves the rest working. Features never import each other.
- `components/`: generic React presentation grouped by role, such as `ui/` and `layout/`. It contains no product workflows.
- `hooks/`: generic React hooks without OpenLight business logic.
- `lib/`: framework-independent low-level code that could become an external package.

Dependencies point downward: `app/` may import every folder; `features/` may import `components/`, `hooks/`, and `lib/`; `components/` and `hooks/` may import `lib/`.
Keep feature-specific components, hooks, and helpers inside their feature. Move them to a generic folder only when their interface no longer contains feature concepts.
Keep the histogram in `features/`; revisit its placement only when its responsibilities change.

## Styling

Tailwind classes stay inline in the component that renders them; reuse styling by composing React components or repeating classes (whichever is fewer lines), never by sharing class-string constants across files. Use `cva` for a component's variants; promote a style to a token in `src/index.css` only when it is app-global, like a shadow or a font style.

## GPU

All React bindings come from `vgpu-react`; everything else comes from `vgpu`.

- `useGpu()` returns the `Gpu`. Every vgpu call takes it as the first argument.
- Build pipelines once per engine instance and reuse them across frames.
- `useSurface(canvasRef)` turns a `<canvas>` into a render target and disposes it on unmount. Its options are read once; to change them, remount the canvas with a `key`.
- `useFrameLoop` renders every animation frame. `useFrame` returns a function that renders once, for pointer and other events.
- Shader code lives in `.wgsl` files beside the module that owns it, or in `lib/` for reusable GPU operations. The Vite loader and ambient types are already configured.
- The working space is linear Rec.2020 in `rgba16float`. Decoders convert into it, the editor shader converts out of it; nothing in between assumes a format or primaries, so both can change (an 8-bit variant is planned).
- `lib/adjustments/adjustments.wgsl` works in that space; its `Adjustments` struct mirrors the TypeScript type in the UI's units, and its constants were fitted against reference exports; treat them as data, not formulas to tidy.
- Retain `workerDecoder` for the upcoming RAW decoding implementation.

## Testing

Prefer a few broad end-to-end tests over many granular tests. Keep one main editing session that opens a fixture, changes controls, checks the preview and histogram, edits curves, uses undo/redo, and exports. Extend that session with named steps instead of adding a test per control. Check actual pixels against known values, with a small tolerance when needed; changed state or a changed screenshot alone does not prove correct rendering. Keep independent loading and rendering checks separate, and load real files for format coverage. Use browser-free tests for invariants that the editing session cannot meaningfully exercise.

Maintain a browser-side control API with semantic commands for loading, editing, and reading state. Extend it with new workflows; it must work in local browsers, CI, and remote sessions. Use DOM interaction when testing the UI itself. Wait for visible results without adding production completion tracking.

## Done

`bun run check` formats and lints. `bun run build` type-checks. `bun run test` runs the browser tests. Run all three after changing files and before a commit.
