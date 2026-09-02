# OpenLight

A Vite, React, and vgpu app. Bun for install and scripts. Biome for format and lint.

`src/main.tsx` owns runtime and provider composition. Browser and WebGPU lifecycles stay behind `vgpu-react` providers and hooks.

## Size

Keep each file focused on one responsibility and one abstraction level. Entry points compose; providers, hooks, and domain modules own lifecycles and policy.
Prefer the smallest implementation that preserves clear ownership.
One component per responsibility: when a component holds state or refs that only part of its markup uses, extract that part into its own component. Within a file, define a function above the function that uses it.

## Structure

The `src/` root holds entrypoints, ambient types, and global styles. Import across folders through the `@/` alias (`@/hooks/use-pointer`); relative paths stay inside a folder. Source modules belong to these folders:

- `app/`: application shell, app-wide state, and composition. It may import every folder below; no folder imports it.
- `features/`: removable product capabilities. A feature owns its UI, state, and behavior; removing its folder and `app/` composition leaves the rest working. Features never import each other.
- `components/`: generic React presentation grouped by role, such as `ui/` and `layout/`. It contains no product workflows.
- `hooks/`: generic React hooks without OpenLight business logic.
- `lib/`: framework-independent low-level code that could become an external package.

Dependencies point downward: `app/` may import every folder; `features/` may import `components/`, `hooks/`, and `lib/`; `components/` and `hooks/` may import `lib/`.
Keep feature-specific components, hooks, and helpers inside their feature. Move them to a generic folder only when their interface no longer contains feature concepts.

## GPU

All React bindings come from `vgpu-react`; everything else comes from `vgpu`.

- `useGpu()` returns the `Gpu`. Every vgpu call takes it as the first argument.
- Build pipelines once: `useMemo(() => effect(gpu, shader), [gpu])`.
- `useSurface(canvasRef)` turns a `<canvas>` into a render target and disposes it on unmount. Its options are read once; to change them, remount the canvas with a `key`.
- `useFrameLoop` renders every animation frame. `useFrame` returns a function that renders once, for pointer and other events.
- Shader code lives in `.wgsl` files next to the component that imports them. The Vite loader and ambient types are already configured.
- The working space is linear Rec.2020 in `rgba16float`. Decoders convert into it, the editor shader converts out of it; nothing in between assumes a format or primaries, so both can change (an 8-bit variant is planned).

## Done

`bun run check` formats and lints. `bun run build` type-checks. Run both after changing files and before a commit.
