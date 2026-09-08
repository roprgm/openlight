# tiff-gpu

Decodes TIFF files into a linear RGB texture, the way a browser hands you a JPEG: color profile applied, orientation applied, alpha straight. The CPU reads the directory; the GPU does the pixels and, when a file has enough strips or tiles to run in parallel, expands LZW and Deflate too. Built on [vgpu](https://vgpu.sh); internal to OpenLight for now.

## Usage

```ts
import { decodeTiff } from "@/lib/tiff-gpu";

const image = await decodeTiff(gpu, await file.arrayBuffer());
// a vgpu Target: rgba16float, linear Rec.2020 by default
```

Options: `colorSpace` picks the output primaries, `"rec2020"` (default, holds every photo gamut), `"srgb"`, `"display-p3"`, or `"none"` to keep sample values as they are; `format` can be `"rgba32float"` to keep those values exact; `gpuChunks` sets how many strips a file needs before its codec runs on the GPU; `image` decodes a layout other than the first, such as a DNG SubIFD. `prepareTiff(bytes, options)` is the CPU half and runs in a worker, returning transferable buffers; `uploadTiff(gpu, prepared, options)` is the GPU half and returns synchronously once its work is queued.

Color comes from the file's ICC profile when it is the matrix/TRC kind every photo editor writes, otherwise samples are treated as sRGB; float samples are taken as linear. Values above 1.0 and below 0.0 pass through.

## Coverage

| | Supported |
| --- | --- |
| Container | TIFF and BigTIFF, both byte orders, strips and tiles, chunky and planar, first image |
| Samples | Unsigned integers of any depth up to 32 bits, packed or byte-aligned; 16, 32, 64-bit floats |
| Color | RGB, grayscale (black or white is zero), palette, camera raw mosaics, alpha as an extra sample |
| Compression | None, LZW, Deflate (8 and 32946), PackBits |
| Predictors | Horizontal (GPU) and floating point (CPU) |

Not supported: JPEG, CMYK, YCbCr, Lab, signed integers, sub-byte fill order.

## How it decides

Every path ends in one compute pass that walks each chunk row: byte order, bit depth, horizontal prediction, plane interleaving, palette lookup, alpha, the transfer curve, the matrix into the output primaries, and orientation. Rows are uploaded in bands sized to the device's buffer limits, so file size is not bounded by them; a small render pass places each band in the target.

LZW and Deflate are serial per strip, so the GPU wins only when many strips decode at once. With fewer than 128 chunks the CPU decodes: our LZW, or the browser's native `DecompressionStream`. PackBits and floating-point prediction always run on the CPU.

## Benchmarks

24 MP RGB, Apple M-series, Chromium, median of 3, file bytes to GPU texture. The geotiff.js column is a JavaScript decoder measured for reference.

| File | geotiff.js | CPU codec + GPU unpack | GPU codec + GPU unpack |
| --- | --- | --- | --- |
| 16-bit uncompressed, 144 MB | 882 ms | 42 ms | |
| 16-bit LZW, 4000 strips | 4216 ms | 846 ms | 237 ms |
| 16-bit LZW, 63 strips | crash | 828 ms | 1470 ms |
| 8-bit LZW, 500 strips | hang | 333 ms | 116 ms |
| 16-bit ZIP, 4000 strips | 2504 ms | 1093 ms | 463 ms |
| 16-bit ZIP, 63 strips | 2583 ms | 539 ms | 3594 ms |

Run it on your own files with `bun run src/lib/tiff-gpu/bench.ts /folder/of/tiffs`; it checks that the CPU and GPU codecs produce identical pixels while timing them.

## Building a RAW loader on top

Camera raw formats are TIFF containers, so a RAW loader is a few pieces on top of this one:

- `readTiff(bytes)` lists every directory with its SubIFDs and gives typed access to any tag, so a DNG loader can find the raw image (photometric CFA or linear raw) and read its black level, white level, and color matrices. `parseTiff(bytes, directory)` turns that directory into a layout, passed to `prepareTiff` as `image`.
- Codecs are tables keyed by compression code: `codecs` and `gpuCodecs` in `codecs.ts` for the CPU side, and the `codecs` map of kernels in `upload.ts`. Lossless JPEG (code 7) fits the same one-strip-per-workgroup model as LZW and Deflate.
- Raw mosaics decode as gray with `colorSpace: "none"` and `format: "rgba32float"`, which yields the exact sample values in a target; demosaicing and camera color then run as passes of their own.

## Tests

Everything the library needs lives in this folder: `fixtures/` with reference pixels, `testing.ts` with the helpers, and `tiff-gpu.test.ts`, which covers the directory reader, CPU codecs, profiles, the GPU inflater, every fixture against its reference, row banding, and the GPU codecs. The shaders run for real under `bun test` through vgpu's Node entry, so no page or browser is involved.

## Follow-ups

Splitting large LZW strips at their clear codes would keep few-strip files on the GPU. A worker for the CPU codecs would keep the page responsive on such files; OpenLight already runs `prepareTiff` in one.
