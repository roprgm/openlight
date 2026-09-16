# Noise reduction: linear Bayer alternative

This branch is an alternative to [PR #19](https://github.com/roprgm/openlight/pull/19),
not a successor selected for release. Both use the same current editor, controls,
RAW decoder, RGB denoiser, white balance, exposure and export path. The difference
is the denoiser used for integer 2×2 Bayer RAW sources.

| Bayer processing | PR #19 | This branch |
| --- | --- | --- |
| Noise measurement | Same-phase second differences and a quiet-bin least-squares fit | Haar HH coefficients, binned medians and a Theil–Sen fit |
| Filtering domain | Signed generalized Anscombe stabilization | Normalized linear sensor samples |
| Transform variance | Unit variance after stabilization | Signal-dependent shot/read variance propagated through squared transform weights |
| Overlap window | GALOSH-derived Kaiser constants | Positive triangular window |

Both use two-stage BM3D-style filtering: 8×8 DCT patches, up to eight matches,
a Walsh group transform, hard thresholding, then pilot-guided Wiener filtering.
Neither claims bit-exact reference BM3D or full covariance modeling. Fine texture
can be mistaken for noise. Real-photo quality and physical-GPU performance still
need comparison.

The linear Bayer algorithm comes from the saved local RAW experiment. Its old
exposure, white-balance and gamut experiments are not part of this branch. The
original experiment consumed floating-point sensor codes; this adaptation reads
`raw-webgpu`'s integer sensor texture and rounds the filtered result back to
16-bit codes before development. Negative values relative to black and values
above nominal white survive within the sensor's unsigned 16-bit range.

## Trying both implementations

Use each PR's preview with the same Bayer RAW file and settings. In Adjust →
Details, compare Noise reduction at 0, 50 and 100. Inspect fine texture, shadows,
color edges and small lights at 100% zoom; compare exported PNGs too. Zero is an
exact bypass. The first positive amount calculates the result; later amount
changes blend the cached result. Undo and redo include the amount.

PNG, JPEG, TIFF, RGB DNG and unsupported RAW mosaics use the same RGB algorithm
as #19, so they do not distinguish these Bayer implementations. That path uses
signed sRGB opponent channels and a half/quarter/eighth-resolution chroma pyramid.

## Pipeline and ownership

RAW decoding → Bayer denoise when supported → development → RGB denoise for
other sources → amount blend → adjustments → curves → details → framing → export.

`bayer/index.ts` filters an exclusively owned second `raw-webgpu` source before
its first development. The original sensor is preserved. It normalizes and packs
four physical Bayer phases, estimates per-phase shot/read noise, runs both filter
stages, and copies the restored sensor codes into that private source.

`index.ts` owns RGB filtering and its temporary textures. `cache.ts` shares
results by image source and absolute white balance between preview and export.
Each Bayer white balance develops the already filtered sensor; it does not repeat
sensor filtering. The RGB fallback recalculates for a changed RAW white balance.
Each renderer owns its blend output. Closing the final renderer releases cached
images; closing the source aborts pending Bayer work and releases both sensors.

## Cost and precision

RGB scratch tiles stay below 9 MiB, plus full-image outputs and approximately
92 MiB of reduced images at 24 MP. Bayer filtering instead allocates three packed
RGBA32F images: approximately 275 MiB at 24 MP, plus a 512 KiB accumulation buffer
and a temporary 46 MiB integer output. The private decoded sensor, developed
images and existing editor allocations are additional. Each full-resolution
RGBA16F result or blend adds approximately 183 MiB at 24 MP.

GPU submissions are bounded by a completion wait between accumulation tiles.
This limits queued work, not total image memory or first-use latency. Packing
and overlap accumulation use FP32; the developed working image uses RGBA16F.
RGB alpha and translucent boundaries bypass filtering.

## Verification and provenance

Browser fixtures check exported pixels for noise error, color bias, texture,
alpha, tile boundaries and exact zero bypass. A 320×320 Bayer detail pair from
the local experiment additionally checks clean-image preservation. Bun tests
cover cache ownership and the robust shot/read fit; mocks do not execute shaders.
Historical benchmark numbers from the old RAW pipeline are not measurements of
this adaptation.

The Bayer noise fit, linear variance propagation and triangular window replace
the earlier GALOSH-derived helpers and constants. GALOSH was inspected during
the original research; #19 preserves the notices for the implementation that
uses it. This branch includes no GALOSH-derived helpers, model weights or new
runtime dependency. Existing decoder notices remain in the `raw-webgpu` package.

Algorithm references: [Dabov et al., BM3D](https://webpages.tuni.fi/foi/GCF-BM3D/),
[NIST, Theil–Sen fit](https://itl.nist.gov/div898/software/dataplot/refman1/auxillar/ts_fit.htm),
and [Mäkinen et al., transform-domain noise variance](https://webpages.tuni.fi/foi/papers/ICIP2019_Ymir.pdf).
These describe principles; this implementation omits covariance between matched
patches and does not reproduce the exact-variance method.
