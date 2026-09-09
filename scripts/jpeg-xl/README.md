# JPEG XL worker decoder

`decode.cc` is OpenLight's small C API adapter around the official libjxl decoder. It reconstructs image samples only: no browser canvas, eight-bit conversion, display tone mapping, or model weights. The TIFF metadata continues to control the subsequent linearization and development stages.

The committed `src/lib/tiff-gpu/jpeg-xl/decoder.js` and `.wasm` were built with Emscripten 6.0.9, CMake 3.31.8, and libjxl 0.12.0 at `a7a9c787341cf703dede03c2009fa460cae5e5df`. libjxl's pinned submodules supply Highway 1.2.0 (`457c891775a7397bdb0376bb1031e6e027af1c48`) and Brotli 1.2.0 (`028fb5a23661f123017c060daa546b55cf4bde29`). skcms is needed by upstream CMake configuration but is not linked into this decoder. The build has SIMD enabled and uses one thread, without SharedArrayBuffer or cross-origin isolation requirements.

With Emscripten and CMake on PATH, run:

```sh
bash scripts/jpeg-xl/build.sh /tmp/openlight-jxl-build
bun run check
bun run build
bun run test:gpu
bun run test:browser
```

The decoder is about 796 KiB uncompressed / 299 KiB gzip. It initializes on first JPEG XL tile and reuses the WASM instance within that file's worker. A shared initialization promise prevents duplicate downloads for concurrent tiles; the decode itself is synchronous and temporary buffers are released before another tile executes. The loader terminates the worker when the file completes. No build tools or codec source downloads run in the browser or Vercel build.

`public/codecs/jpeg-xl.LICENSE.txt` accompanies the deployed binary and includes libjxl (BSD-3-Clause and patent grant), Highway (BSD-3-Clause option), Brotli (MIT), and the relevant Emscripten/LLVM/musl runtime notices. Update those notices when changing the build toolchain or vendored revisions.

References: [libjxl decoder API](https://libjxl.readthedocs.io/en/latest/api_decoder.html), [upstream WebAssembly build instructions](https://github.com/libjxl/libjxl/blob/v0.12.0/doc/building_wasm.md), [Adobe DNG specification](https://helpx.adobe.com/camera-raw/desktop/dng-and-file-formats/digital-negative.html).
