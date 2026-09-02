# vgpu-react-starter

A starting point for a Vite + React + vgpu app. Bun for install and scripts. Biome for format and lint.

`src/main.tsx` mounts `GpuProvider`, which calls `init()` and renders nothing until the device is ready. `src/app.tsx` is the first component inside it. Grow from there.

## Size

Build the smallest app that satisfies the current need.
Keep code local and linear. Add an abstraction or a dependency only when it removes real complexity.
Grow from the files that already exist. Split a file when it is doing two jobs.

## GPU

All React bindings come from `vgpu-react`; everything else comes from `vgpu`.

- `useGpu()` returns the `Gpu`. Every vgpu call takes it as the first argument.
- Build pipelines once: `useMemo(() => effect(gpu, shader), [gpu])`.
- `useSurface(canvasRef)` turns a `<canvas>` into a render target and disposes it on unmount. Its options are read once; to change them, remount the canvas with a `key`.
- `useFrameLoop` renders every animation frame. `useFrame` returns a function that renders once, for pointer and other events.
- Shader code lives in `.wgsl` files next to the component that imports them. The Vite loader and ambient types are already configured.

## Done

`bun run check` formats and lints. `bun run build` type-checks. Run both after changing files and before a commit, until neither reports an issue.
