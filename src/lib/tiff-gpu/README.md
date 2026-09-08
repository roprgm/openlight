# tiff-gpu

Decodes TIFF files into a linear RGB texture, the way a browser hands you a JPEG: color profile applied, orientation applied, alpha straight. The CPU reads the directory and decompresses; the GPU does everything about pixels. Built on [vgpu](https://vgpu.sh); internal to OpenLight for now.

## Usage

```ts
import { decodeTiff } from "@/lib/tiff-gpu";

const image = await decodeTiff(gpu, await file.arrayBuffer());
// a vgpu Target: rgba16float, linear Rec.2020 by default
```

Options: `colorSpace` picks the output primaries, `"rec2020"` (default, holds every photo gamut), `"srgb"`, `"display-p3"`, or `"none"` to keep sample values as they are; `format` can be `"rgba32float"` to keep those values exact; `image` decodes a layout other than the first, such as a DNG SubIFD. `prepareTiff(bytes, options)` is the CPU half and runs in a worker, returning transferable buffers; `uploadTiff(gpu, prepared, options)` is the GPU half and returns synchronously once its work is queued.

Color comes from the file's ICC profile when it is the matrix/TRC kind every photo editor writes, otherwise samples are treated as sRGB; float samples are taken as linear. Values above 1.0 and below 0.0 pass through.

## Coverage

| | Supported |
| --- | --- |
| Container | TIFF and BigTIFF, both byte orders, strips and tiles, chunky and planar, first image |
| Samples | Unsigned integers of any depth up to 32 bits, packed or byte-aligned; 16, 32, 64-bit floats |
| Color | RGB, grayscale (black or white is zero), palette, camera raw mosaics, alpha as an extra sample |
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

## DNG

`decodeDng`-style use is two calls, like TIFF: `prepareDng(bytes)` finds the Bayer mosaic among the directories, reads black and white levels, the CFA pattern, the as-shot neutral, and the color matrix for daylight, and decompresses the tiles; `developDng(gpu, prepared)` uploads the mosaic as a float texture and runs one pass that demosaics (bilinear), white-balances, clips at the sensor's white, and converts camera RGB to linear Rec.2020, oriented and cropped to the default crop. Lossless JPEG (compression 7) is the codec DNG files use, added to the table.

Not yet: linearization tables, linear raw (demosaiced) DNG, X-Trans and other non-2×2 patterns, opcode lists, and lens corrections. Camera-native formats (ARW, NEF, CR2) need their own codecs and a matrix table; see below.

## Building a RAW loader on top

Camera raw formats are TIFF containers, so a native-format loader is a few pieces on top of the DNG path:

- `readTiff(bytes)` lists every directory with its SubIFDs and gives typed access to any tag, so a DNG loader can find the raw image (photometric CFA or linear raw) and read its black level, white level, and color matrices. `parseTiff(bytes, directory)` turns that directory into a layout, passed to `prepareTiff` as `image`.
- Codecs are a table keyed by compression code in `codecs.ts`; lossless JPEG (code 7) is one entry away.
- Raw mosaics decode as gray with `colorSpace: "none"` and `format: "rgba32float"`, which yields the exact sample values in a target; demosaicing and camera color then run as passes of their own.

## Tests

Everything the library needs lives in this folder: `fixtures/` with reference pixels, `testing.ts` with the helpers, and `tiff-gpu.test.ts`, which covers the directory reader, codecs, profiles, every fixture against its reference in linear Rec.2020, raw output, and row banding. The shaders run for real under `bun run test:gpu` through vgpu's Node entry, so no page or browser is involved; plain `bun test` and CI skip them.

## Follow-ups

A persistent worker would save the spawn cost per file; OpenLight already runs `prepareTiff` in a fresh one.
