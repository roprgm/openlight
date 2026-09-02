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
