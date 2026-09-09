# tiff-gpu

Decodes TIFF files into a linear RGB texture, the way a browser hands you a JPEG: color profile applied, orientation applied, alpha straight. The CPU reads the directory and decompresses; the GPU does everything about pixels. Built on [vgpu](https://vgpu.sh); internal to OpenLight for now.

## Usage

```ts
import { decodeTiff } from "@/lib/tiff-gpu";

const image = await decodeTiff(gpu, await file.arrayBuffer());
// a vgpu Target: rgba16float, linear Rec.2020 by default
```

Options: `colorSpace` picks the output primaries, `"rec2020"` (default, holds every photo gamut), `"srgb"`, `"display-p3"`, or `"none"` to keep sample values as they are; `format` can be `"rgba32float"` to keep those values exact; `image` decodes a layout other than the first, such as a SubIFD. `prepareTiff(bytes, options)` is the CPU half and runs in a worker, returning transferable buffers; `uploadTiff(gpu, prepared, options)` is the GPU half and returns synchronously once its work is queued.

Color comes from the file's ICC profile when it is the matrix/TRC kind every photo editor writes, otherwise samples are treated as sRGB; float samples are taken as linear. Values above 1.0 and below 0.0 pass through.

## Coverage

| | Supported |
| --- | --- |
| Container | TIFF and BigTIFF, both byte orders, strips and tiles, chunky and planar, first image |
| Samples | Unsigned integers of any depth up to 32 bits, packed or byte-aligned; 16, 32, 64-bit floats |
| Color | RGB, grayscale (black or white is zero), palette, TIFF/EP sensor mosaics (CFA, linear raw), alpha as an extra sample |
| Compression | None, LZW, Deflate (8 and 32946), PackBits, lossless JPEG (7) |
| Predictors | Horizontal (GPU) and floating point (CPU) |

Not supported: JPEG, CMYK, YCbCr, Lab, signed integers, sub-byte fill order.

## How it works

`prepareTiff` parses the directory, turns the ICC profile into a curve table and a matrix, and decompresses every strip or tile into raw rows with the CPU codecs; uncompressed files are used in place. Codecs are serial per strip, and a worker keeps them off the page.

`uploadTiff` splits the rows into bands sized to the device's buffer limits, so file size is not bounded by them, and runs one compute pass per band that walks each chunk row: byte order, bit depth, horizontal prediction, plane interleaving, palette lookup, alpha, the transfer curve, the matrix into the output primaries, and orientation. A small render pass places each band in the target.

## Benchmarks

24 MP RGB, Apple M-series, Chromium, median of 3, file bytes to GPU texture. The geotiff.js column is a JavaScript decoder measured for reference.

| File | geotiff.js | tiff-gpu |
| --- | --- | --- |
| 16-bit uncompressed, 144 MB | 882 ms | 42 ms |
| 16-bit LZW | 4216 ms, crashes on large strips | ~850 ms |
| 16-bit ZIP | ~2500 ms | 540 to 1100 ms |

Compressed files spend their time in the CPU codec. GPU kernels for LZW and Deflate were built and measured too: 2 to 4× faster on files with thousands of strips, slower on files with few, and about 350 lines. They were removed for simplicity and live in this branch's history (commit `ac6d140`); splitting strips at LZW clear codes would let them win on every file.

Run the benchmark on your own files with `bun run --preload ./tests/setup.ts src/lib/tiff-gpu/bench.ts /folder/of/tiffs`.

## Building on it

`readTiff(bytes)` lists every directory with its SubIFDs and gives typed access to any tag; `parseTiff(bytes, directory)` turns a chosen directory into a layout that `prepareTiff` takes as `image`. Codecs are a table keyed by compression code in `codecs.ts`. Sensor mosaics decode as gray with `colorSpace: "none"` and `format: "rgba32float"`, which yields exact sample values for passes of their own. `lib/camera-raw` is built this way.

## Tests

Everything the library needs lives in this folder: `fixtures/` with reference pixels, `testing.ts` with the helpers, and `tiff-gpu.test.ts`, which covers the directory reader, codecs, profiles, every fixture against its reference in linear Rec.2020, raw output, and row banding. The shaders run for real under `bun run test:gpu` through vgpu's Node entry, so no page or browser is involved; plain `bun test` and CI skip them.

## Follow-ups

A persistent worker would save the spawn cost per file; OpenLight already runs `prepareTiff` in a fresh one.

## JPEG XL

Compression 52546 uses a lazy-loaded libjxl 0.12.0 WebAssembly decoder in the loading worker. DNG integer samples use the JPEG XL storage range (byte for codestreams up to 8 bits, full uint16 otherwise), independently of the TIFF bit-depth tag; ordinary RGB/gray TIFF scales to full uint16; 16-bit floating-point samples decode to float32, preserving headroom. Tile dimensions and channels are checked before decoding. WASM temporary buffers are freed after each tile, and the loader terminates the worker after each file. Color development remains on WebGPU.

The decoder asset is about 796 KiB (299 KiB gzip); it is fetched only for JPEG XL input. The compiled decoder, build source, and provenance are in `scripts/jpeg-xl/README.md`; distributed notices are at `/codecs/jpeg-xl.LICENSE.txt`.
