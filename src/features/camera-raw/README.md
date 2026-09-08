# Camera RAW

This removable feature uses LibRaw for camera identification, metadata and codecs.
Sony ARW2 unpacking, Malvar–He–Cutler demosaic, white balance, highlight roll-off
and conversion to linear Rec.2020 run in our WGSL. TIFF never enters this module.

`index.ts` registers the lazy decoder. `worker.ts` owns the LibRaw boundary and
transfers sensor bytes. `load.ts` uploads those bytes to an `r32float` sensor
texture. `development.ts` retains that texture and creates separate outputs for
the editor and export. Add pre-demosaic denoising between unpack and development.
The `develop.wgsl` demosaic and highlight functions have separate responsibilities.
`white-balance.ts` derives Kelvin/tint from file gains and camera calibration.
`controls.tsx` owns the absolute controls and their edit validation.

The editor only knows the optional `Development` interface and serializable
`Scene.sourceSettings`. History, rendering, original comparison and export have
no knowledge of cameras or white balance. TIFF remains in `lib/tiff-gpu`; RAW owns its camera-to-working-space conversion.
Both use gl-matrix for low-level matrix operations.

To remove RAW, delete this folder and its fixture/test files, then remove the
Camera RAW imports and composition in `app/controls.ts`, `app/landing/index.tsx`
and `app/editor/sidebar/adjustment-controls.tsx`. Remove the matching Biome
vendor exclusion. LibRaw attribution lives in the root `NOTICE`. The TIFF decoder
and editor need no changes. A replacement decoder only needs `accepts(file)` and
`load(file)` returning an image and optional development.

Currently supports the integer Bayer formats decoded by this LibRaw build,
including the tested Sony ARW, Nikon NEF, Canon CR2/CR3 and Bayer DNG. X-Trans,
Foveon, floating RAW and spatially varying black calibration are rejected.
Kelvin/tint are an approximate chromaticity conversion and may differ from
Lightroom. As Shot restores the exact file gains. DNG uses its import-time matrix;
changing temperature does not re-interpolate a dual-illuminant profile.
Highlight roll-off neutralizes saturated channels; it does not reconstruct lost detail.

Rebuild with `python3 src/features/camera-raw/build.py` after activating Emscripten 6.0.9.
The script downloads the pinned upstream source and verifies its SHA-256 before compiling.
