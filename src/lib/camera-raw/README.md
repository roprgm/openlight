# Camera RAW

DNG decoding runs in a worker; development runs on WebGPU. Image tags select Bayer or LinearRaw, never the camera model. TIFF codecs provide decompression, including the precompiled JPEG XL decoder used by Apple ProRAW.

```ts
import { developDng, prepareDng } from "@/lib/camera-raw";

const source = developDng(gpu, await prepareDng(await file.arrayBuffer()));
// source.image is linear Rec.2020; source.whiteBalance enables Kelvin/tint editing.
// Transfer the source to document resources, or dispose both when finished:
source.whiteBalance?.dispose();
source.image.color.dispose();
```

## Pipeline

`createDevelopment` composes normalization → optional Bayer demosaic → working-color conversion. Normalization applies the linearization table and black/white levels. The final pass combines white balance, camera color, baseline exposure, profile gains, crop, and orientation. Samples keep their highlight headroom until display mapping.

`developDng` retains camera RGB for interactive white balance. Kelvin/tint edits rerun only the final pass; preview and export own independent outputs. The editor consumes the format-independent `ImageSource.whiteBalance` capability, so another loader can provide absolute white balance without changing the UI. Images without that capability retain relative controls.

As Shot comes from `AsShotNeutral` or `AsShotWhiteXY`, including analog balance and matching camera calibration. Calibration interpolates in reciprocal Kelvin. Temperature uses the Kang et al. (2002) Planckian-locus approximation over 2000–25000 K; tint is perpendicular CIE 1960 uv displacement, 0.0001 per unit. These profile-derived values can differ from camera MakerNotes or another editor's tint scale. Reset preserves the exact recorded neutral.

The shared stage runner in `lib/pipeline.ts` resolves named inputs and owns stage cleanup. React only mounts outputs and connects controls. A future Bayer denoiser belongs after normalization and before demosaic; RGB denoising belongs before editor adjustments. No denoiser is included here.

## Limits and verification

Bayer demosaic is bilinear; LinearRaw supports one or three channels. DNG opcode lists, ProfileGainTableMap2, full illuminant-dependent profile rendering (including ForwardMatrix and ProfileToneCurve), X-Trans, and native ARW/NEF/CR2 decoding remain unsupported. The daylight camera-to-working matrix remains fixed.

Editable images retain a float32 camera texture (16 bytes per stored pixel). Development scratch peaks at roughly 40 bytes/pixel for LinearRaw and 56 for Bayer, excluding decoded buffers. Software-GPU tests verify pixels, codecs, profile gains, white balance, and ownership; physical-GPU performance still needs measurement.

References: [DNG specification](https://helpx.adobe.com/camera-raw/desktop/dng-and-file-formats/digital-negative.html), [temperature approximation](https://colour.readthedocs.io/en/master/_modules/colour/temperature/kang2002.html). Codec attribution is in the repository's `NOTICE`.
