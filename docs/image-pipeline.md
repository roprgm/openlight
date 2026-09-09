# Image pipeline preparation

This change is based on PR14 and intentionally precedes denoising. It introduces explicit image dependencies without a node editor or a general graph scheduler.

## Responsibilities

- `lib/pipeline.ts` runs ordered stages. Each stage names its input, returns a target, and disposes its own resources. Inputs can refer to any earlier stage, allowing branches. Bypassing a stage returns its input, so downstream stages resolve the current target on every render. Invalid or forward dependencies are rejected at construction.
- `lib/camera-raw` composes DNG normalization, optional Bayer demosaic, and working-color conversion. The loader still runs CPU decoding in a worker and transfers the resulting texture into the document.
- `lib/editor/renderer.ts` composes adjustments → curves → clarity → sharpening, then frames the original, adjusted, and final images for the editor. Display, histogram, and export consume engine outputs. Frame submission and notifications remain with the renderer.
- React bindings mount engine outputs and connect lifecycles. The stage runner, development, and renderer import no React and can be constructed directly in tests or browser commands.

The pipeline owns its stages but borrows its source. It neither submits GPU work nor stores React state. Resource creation happens when constructing the owning engine; stages reuse their effects and targets across edits. There is no serialized node schema, automatic scheduling, or cache invalidation system yet.

## Denoising insertion points

Bayer samples can be denoised after normalization, before interpolation spreads noise into neighboring channels. LinearRaw has no mosaic to reconstruct, so it skips demosaic. Ordinary TIFF and other decoded RGB images can be denoised before the editor's adjustment stages. Interactive RAW denoising will additionally require retaining prepared RAW data or its normalized GPU source in the document resource owner; the current loader releases development scratch after import.

## Verification

The pipeline lifecycle test exercises a branch, bypass changes across frames, invalid dependencies, and disposal using `vgpu/mock`. Existing document/renderer tests cover edits, history, resource reuse, and framing without React. DNG GPU tests execute real WGSL and compare synthetic fixtures against independent pixel references. Browser coverage loads and exports both LinearRaw codecs through the actual worker path.

No new runtime dependency or model weights are introduced. This work leaves the existing denoiser on its separate branch.
