# tiff-gpu

Decodes TIFF files into a WebGPU texture. The CPU reads the directory; the GPU unpacks samples and, when a file has enough strips or tiles to run in parallel, expands LZW and Deflate too. Built on [vgpu](https://vgpu.sh); internal to OpenLight for now.

## Usage

```ts
import { decodeTiff, prepareTiff, uploadTiff } from "@/lib/tiff-gpu";

const image = await decodeTiff(gpu, await file.arrayBuffer());
// image.texture: rgba16uint, image.float, image.premultiplied, image.orientation, image.icc
```

`prepareTiff(bytes)` is the CPU half and runs in a worker; it returns transferable buffers. `uploadTiff(gpu, prepared)` is the GPU half and returns synchronously once its work is queued. Samples come out scaled to 16 bits, or as float16 bit patterns when `float` is set, in a texture the size of the stored image. Orientation, alpha premultiplication, and the ICC profile are reported, not applied.

## Coverage

| | Supported |
| --- | --- |
| Container | TIFF and BigTIFF, both byte orders, strips and tiles, chunky and planar, first image |
| Samples | 1, 2, 4, 8, 16, 32-bit unsigned integers; 16, 32, 64-bit floats |
| Color | RGB, grayscale (black or white is zero), palette, alpha as an extra sample |
| Compression | None, LZW, Deflate (8 and 32946), PackBits |
| Predictors | Horizontal (GPU) and floating point (CPU) |

Not supported: JPEG, CMYK, YCbCr, Lab, signed integers, sub-byte fill order.

## How it decides

Every path ends in one compute pass that walks each chunk row: byte order, bit depth, horizontal prediction, plane interleaving, palette lookup, and the write into the texture. Rows are uploaded in bands sized to the device's buffer limits, so file size is not bounded by them.

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

Run it on your own files with `BENCH_DIR=/folder/of/tiffs bun run test:browser src/lib/tiff-gpu/bench.e2e.ts`. `testing.ts` holds the browser-side helpers that time variants and check that they produce identical pixels.

## Tests

Everything the library needs lives in this folder: `fixtures/` with reference samples, `tiff-gpu.test.ts` for the directory reader, CPU codecs, and prepare stage in Bun, and `tiff-gpu.e2e.ts` for the GPU inflater, stored-sample checks, row banding, and GPU codecs in Playwright. Run `bun test tiff-gpu` and `bun run test:browser src/lib/tiff-gpu`.

## Follow-ups

Splitting large LZW strips at their clear codes would keep few-strip files on the GPU. A worker for the CPU codecs would keep the page responsive on such files; OpenLight already runs `prepareTiff` in one.
