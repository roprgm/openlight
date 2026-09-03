# OpenLight

**An open-source image editor for the browser, built with [vgpu.sh](https://vgpu.sh)**

Open a photo, adjust light and color, export the result. Edits are non-destructive and rendering runs on your GPU through WebGPU. Everything stays on your machine: no account, no upload.

Needs a WebGPU-capable browser: Chrome or Edge stable, Safari 26+.

## Run

```sh
bun install
bun dev
```

```sh
bun run check   # format + lint
bun run build   # typecheck + bundle
```

## License

[MIT](LICENSE)

## Browser controls

`window.openlight` is available after the app mounts, including production builds.
The UI, renderer, and browser API share the Zustand scene store in
`src/app/scene/index.ts`. The scene currently contains a source image and
adjustments. `app/editor/renderer/renderer.ts` executes the adjustment and display passes imperatively through
vgpu. `RendererProvider` owns the engine and frame loop; canvas and histogram
components attach their outputs through `useRenderer`. The API calls the store actions directly:

```js
await openlight.loadImage(new File([bytes], "photo.png", { type: "image/png" }));
openlight.setAdjustments({ exposure: 1, saturation: -25 });
const state = // Or read immediately: openlight.getState()
```

`setAdjustments` merges a partial update. Exposure accepts -5 to 5; other
adjustments accept -100 to 100. Loading another image resets adjustments.
State includes the file name and adjustments. `loadImage` starts decoding
immediately and resolves after decoding finishes; failures appear in the editor. The renderer runs every frame.
