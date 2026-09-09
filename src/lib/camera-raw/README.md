# camera-raw

Develops Bayer and LinearRaw DNG files into an oriented, cropped, linear Rec.2020 `rgba16float` texture. [tiff-gpu](../tiff-gpu/README.md) reads the container and decompresses the samples in a worker; development runs on WebGPU without React.

```ts
import { developDng, prepareDng } from "@/lib/camera-raw";

const image = developDng(gpu, await prepareDng(await file.arrayBuffer()));
// The caller owns image.color and must dispose it.
```

## Development stages

`createDevelopment(gpu, prepared)` exposes an ordered [image pipeline](../pipeline.ts):

1. `normalize`: expand the optional linearization table, subtract repeated/per-channel black levels and row/column deltas, and normalize by each channel's white level. Negative samples are retained.
2. `demosaic`: bilinear interpolation, present only for a 2×2 RGB Bayer CFA. LinearRaw already contains complete color samples and skips this stage.
3. `working-color`: as-shot white balance, camera-to-Rec.2020 conversion, baseline exposure, optional profile gain table, crop, and orientation. These operations share a pass to avoid another full-size texture. The existing white-balance clipping happens before baseline exposure; subsequent gain preserves values above 1 for editor adjustments.

`BaselineExposure` and `BaselineExposureOffset` define the initial brightness at editor exposure 0. `ProfileGainTableMap` (52525) then applies spatial and intensity-dependent gains. Lookup uses linear ProPhoto D50 (RIMM), after baseline compensation, with pixel-centered active-area coordinates and trilinear interpolation as specified in DNG 1.7.1, pages 71–73. The gain map is a small storage buffer, not another full-size image. No new library is required.

The data's PhotometricInterpretation and sample layout select the stages, never the camera make or model. The reader searches IFDs and SubIFDs for the largest non-preview CFA or LinearRaw image. LinearRaw supports one or three channels, including lossless JPEG RGB. TIFF upload preserves these color channels instead of treating them as gray plus alpha.

Call `pipeline.render(frame, undefined)` inside a vgpu frame. Afterwards, `pipeline.output("normalize")` exposes normalized stored samples and `pipeline.output("working-color")` exposes the final image. `takeOutput()` transfers ownership of the final texture; `dispose()` releases the remaining textures and metadata buffers. `developDng` performs this one-shot lifecycle for the loader.

A future RAW denoiser belongs after normalization and before demosaic; RGB denoising can use linear samples or the editor's working-space source. This preparation change does not implement denoising or retain RAW data in the document for interactive redevelopment.

## Scope and cost

Supported compression is inherited from tiff-gpu. LinearRaw fixes the Bayer-only rejection for demosaiced DNG, a representation used by Apple ProRAW. JPEG XL (compression 52546) is decoded locally by the lazy-loaded libjxl worker module. DNG opcode lists, ProfileGainTableMap2, full camera profile rendering (including ProfileToneCurve), X-Trans demosaic, and native ARW/NEF/CR2 readers remain unsupported. Therefore this is not complete ProRAW support or a match to Apple's contrast and color rendering.

Development retains float32 source and intermediate textures for precision and inspection, then releases them after loading. This costs additional passes and temporary memory compared with the former fused shader: about 40 bytes per stored pixel for LinearRaw and 56 for Bayer, assuming an uncropped output, excluding upload/decompression buffers. Large images need physical-GPU memory/performance measurements; tiled processing or selective retention should precede a memory-heavy denoiser. Software GPU tests establish correctness, not interactive performance.

## Tests

`camera-raw.test.ts` checks directory selection, sample layout, decoded values, and metadata. `bun run test:gpu` also executes the real shaders and compares pixels against independent references for Bayer and LinearRaw, including companding, per-channel black levels, orientation, crop, and ownership transfer. The LinearRaw checkerboard makes unwanted demosaic visible. Profile fixtures cover baseline exposure, both gain-map byte orders, spatial/intensity interpolation, edge replication, and HDR headroom. The browser TIFF/DNG session compares the profile DNG export against an independently generated float TIFF.

References: [Adobe DNG specification](https://helpx.adobe.com/camera-raw/desktop/dng-and-file-formats/digital-negative.html), [Apple's ProRAW format overview](https://developer.apple.com/videos/play/wwdc2021/10160/).
