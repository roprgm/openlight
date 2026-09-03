# OpenLight

A Vite, React, and vgpu app. Bun for install and scripts. Biome for format and lint.

Demonstrate a professional photo editor with little, readable code.

`src/main.tsx` owns runtime and provider composition.

## Size

Keep each file focused on one responsibility and one abstraction level. Entry points compose; providers, hooks, and domain modules own lifecycles and policy.
Prefer the smallest implementation that preserves clear ownership.
Prefer direct vgpu operations. Add wrappers, validation, scheduling, or caching only for a current requirement.
One component per responsibility: when a component holds state or refs that only part of its markup uses, extract that part into its own component. Within a file, define a function above the function that uses it.

## Engine and React

React owns UI composition, controls, and mounting engine outputs. Scene actions perform decoding and other processing imperatively. The engine owns GPU resources, rendering, and derived data such as histogram bins; frame data stays outside React state and props.

Providers expose stable engine instances and connect their lifetime to mounting and cleanup. The engine creates and disposes its resources. Canvas and histogram components attach their outputs through the provider.

The Zustand scene store owns document state. UI interactions and browser commands call the same actions; the renderer reads the scene directly.

## Structure

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

Prefer a small number of browser-level tests for real application features. Each test should exercise a complete user-visible behavior and cover as much relevant code as practical. Avoid narrow unit tests for simple implementation details and do not add tests only to increase coverage.

Maintain a browser-side control API for agents and browser tests. Expose stable, semantic commands for real workflows such as loading an image, changing an adjustment, and reading application state. Use DOM interaction only when the UI interaction itself is under test. Tests wait for visible results without adding production completion tracking.

Extend the control API whenever a feature adds a workflow that agents need to exercise. It may require an explicit test mode, but it must work in local browsers, CI, and remote browser sessions.

## Done

`bun run check` formats and lints. `bun run build` type-checks. `bun run test` runs the browser tests. Run all three after changing files and before a commit.
