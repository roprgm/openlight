# Noise reduction

Independent two-stage BM3D-style filtering in WGSL: 8×8 DCT patches, up to eight
matches, a Walsh group transform, hard thresholding, then pilot-guided Wiener
filtering. Overlapping patches contribute through a positive triangular window.
A half/quarter/eighth-resolution pyramid removes broader chroma noise, with
noise re-estimated at each level. Only the color correction is transferred back;
full-resolution luminance stays in the final collaborative pass. Range weights
and a chroma-detail guard protect small features lost at coarser scales.
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
model. Demosaic produces spatially correlated noise that a single fine-scale
estimate can miss. Downsampling makes broader chroma noise measurable and
filterable; coarse-to-fine correction supplements the existing patch filter.
See Mäkinen et al., [transform-domain noise variance](https://webpages.tuni.fi/foi/papers/ICIP2019_Ymir.pdf),
for the importance of correlation in collaborative filtering. This implementation
does not model the full covariance or implement their exact-variance method.

Fine texture can still be mistaken for noise, and very broad blotches or JPEG
artifacts may remain. Extreme RAW white balance can reduce effectiveness.
The amount blends the output; it does not change thresholds.

Packing and accumulation use FP32; the result uses the input format, normally
RGBA16F. There is no added 8-bit staging or upper-value clamp. HDR and negative
working values are retained. Alpha, translucent pixels and their immediate
boundary bypass filtering. Images with a dimension below 24 pixels or no usable
opaque statistics also bypass it. Input precision still depends on the loader.

## Cost and checks

The first calculation is expensive. Work is submitted in small batches with a
GPU completion wait between them. Scratch tiles stay below 9 MiB: two 512×512
RGBA32F tiles and a 128×128 accumulation buffer. The pyramid additionally holds
its reduced input and filtered result (about 92 MiB at 24 MP, at peak). Deeper
levels finish and release their scratch before finer levels allocate theirs.
Output tiles cover 384×384 pixels with a 64-pixel halo for both filtering stages.
The three reduced resolutions add roughly 33% to the image area processed;
small images have proportionally greater tile/halo overhead.

Each cached result and each active blend adds a full-resolution RGBA16F texture
(about 183 MiB at 24 MP). A changed RAW white point also retains its developed
input. Tiling bounds scratch memory, not total image memory. Hardware latency
still needs measurement; software-WebGPU tests are correctness checks.

The browser test loads clean/noisy fixture pairs, applies NR, and compares the
exported pixels. It checks lower squared error, limited color bias, retained
fine detail, the tile boundary, dimensions, alpha and exact bypass at zero.
The same flow runs for PNG, RGB16 TIFF, Bayer DNG and a correlated-color-noise
fixture. That fixture also measures smooth sky, a color boundary and a tiny red
light: a globally blurred or desaturated result must fail. In software WebGPU,
its RGB MSE fell from 66.39 in the previous version to 13.08 (noisy input: 77.88).
This is a regression check, not a general photographic benchmark. One small Bun
test covers shared cache ownership across preview/export white-balance changes.
