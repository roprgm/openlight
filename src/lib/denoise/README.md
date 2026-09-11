# Noise reduction

Independent two-stage BM3D-style filtering in WGSL: 8×8 DCT patches, up to eight
matches, a Walsh group transform, hard thresholding, then pilot-guided Wiener
filtering. Overlapping patches contribute through a positive triangular window.
This is not a bit-exact implementation of reference BM3D or CBM3D.

Algorithm background: Dabov et al., [Image denoising by sparse 3D transform-domain
collaborative filtering](https://webpages.tuni.fi/foi/GCF-BM3D/), IEEE TIP 2007.
No GALOSH helpers, reference implementation, model weights, or new dependency is
included. The implementation uses OpenLight's license.

## Pipeline and ownership

RAW development / image decoding → denoise → amount blend → exposure and other
adjustments → curves → clarity / sharpening → framing → display / export.

The input is linear Rec.2020 RGB from the existing loaders. RAW development,
demosaic, TIFF decoding and white balance remain owned by `raw-webgpu`. This
integration operates **after demosaic**, and also handles linear DNG and
CPU-prepared RAW without a mosaic. The package currently offers no public
filtered-input override for its development pass. Pre-demosaic filtering requires
that extension; mutating its retained sensor texture would invalidate assumptions
such as the package's X-Trans RGB cache.

`index.ts` owns one calculation and its scratch textures. `cache.ts` shares
results between renderers, keyed by source and absolute white balance. Each RAW
result uses an immutable development snapshot; As Shot reuses the original image.
The cache keeps one idle result plus snapshots still in use by a preview/export,
and closes when its last renderer closes. Slider changes, exposure, cropping and
curves reuse the result. A RAW Kelvin/tint change recalculates it.

`blend.ts` owns each renderer's amount-blend output. Zero returns the unfiltered
input. The scene stores only the amount, so undo/redo does not copy image data.
Exports wait for their captured settings and retain the source during processing.
The Details slider always stays available, including at zero and across modes.

## Noise model and precision

Filtering uses signed sRGB-encoded opponent channels internally. Robust diagonal
Haar differences estimate each channel's variance over 16 brightness bins.
Samples two pixels apart capture some demosaic correlation; a stride of three
covers all Bayer phases. This is a measured RGB model, not a sensor shot/read
model. Fine texture can be mistaken for noise, and large chroma blotches or JPEG
artifacts may remain. Extreme RAW white balance changes channel correlations and
can reduce its effectiveness. The amount blends the output; it does not change thresholds.

Packing and accumulation use FP32; the result uses the input format, normally
RGBA16F. There is no added 8-bit staging or upper-value clamp. HDR and negative
working values are retained. Alpha, translucent pixels and their immediate
boundary bypass filtering. Images with a dimension below 24 pixels or no usable
opaque statistics also bypass it. Input precision still depends on the loader.

## Cost and checks

The first calculation is expensive. Work is submitted in small batches with a
GPU completion wait between them. Scratch memory is below 9 MiB: two 512×512
RGBA32F tiles and a 128×128 accumulation buffer. Output tiles cover 384×384 pixels
with a 64-pixel halo for both stages to avoid seams.

Each cached result and each active blend adds a full-resolution RGBA16F texture
(about 183 MiB at 24 MP). A changed RAW white point also retains its developed
input. Tiling bounds scratch memory, not total image memory. Hardware latency
still needs measurement; software-WebGPU tests are correctness checks.

Bun tests cover shared preparation, white-balance isolation, cache disposal,
coalesced edits, failure recovery, zero and history. Browser tests check known
clean/noisy PNG, RGB16 TIFF and Bayer DNG pixels, including tile seams, texture,
alpha, HDR, sub-8-bit precision, white-balance changes and linear JPEG XL DNG.
