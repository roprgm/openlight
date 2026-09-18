# Noise reduction

Integer Bayer RAWs use linear pre-demosaic filtering followed by a cached,
post-development chroma correction. The stabilized alternative in
[PR #19](https://github.com/roprgm/openlight/pull/19) is closed; its revision
`a6c1e09` remains a comparison reference.

The sensor and RGB paths use two-stage BM3D-style filtering: 8×8 DCT patches, up to eight matches,
a Walsh group transform, hard thresholding, then pilot-guided Wiener filtering.
Neither claims bit-exact reference BM3D or full covariance modeling. Fine texture
can be mistaken for noise. Real-photo quality and physical-GPU performance still
need comparison.

This implementation reads
`raw-webgpu`'s integer sensor texture and rounds the filtered result back to
16-bit codes before development. Negative values relative to black and values
above nominal white survive within the sensor's unsigned 16-bit range.

## Checking the result

Use the same Bayer RAW file and settings before and after changes. In Adjust →
Details, compare Noise reduction at 0, 50 and 100. Inspect fine texture, shadows,
color edges and small lights at 100% zoom; compare exported PNGs too. Zero is an
exact bypass. The first positive amount calculates the result; later amount
changes blend the cached result. Undo and redo include the amount.

PNG, JPEG, TIFF, RGB DNG and unsupported RAW mosaics use the RGB fallback. It uses
signed sRGB opponent channels and a half/quarter/eighth-resolution chroma pyramid.

## Pipeline and ownership

`../pass.ts` exposes preparation, rendering and disposal without React. The app's
renderer factory inserts it before adjustments; the shared renderer and RAW
adapter do not import noise reduction. `RawDevelopment.sensor.clone()` supplies
an owned sensor copy. `bayer/source.ts` filters it lazily, shares concurrent work,
releases failures, and permits retries. The feature owns its cache and commands.

RAW decoding → Bayer denoise when supported → development → Bayer chroma cleanup
or RGB denoise for other sources → amount blend → adjustments → curves → color mixer → vignette → details → framing → export.

`bayer/index.ts` filters an exclusively owned second `raw-webgpu` source before
its first development. The original sensor is preserved. It normalizes and packs
four physical Bayer phases, estimates per-phase shot/read noise, runs both filter
stages, and copies the restored sensor codes into that private source. Half-strength
variance regularization on the shared Bayer component retains more common detail;
color-difference components keep full regularization. This is a calibration
tradeoff that can retain more luminance grain, not an exact noise model.

`chroma.ts` downsamples the developed Bayer image to quarter resolution and reuses
the RGB filter and its three-level pyramid there, using four times the measured
chroma variance for stronger correlated-color shrinkage. Only the resulting color
correction returns to half and full resolution. Coarse noise estimates guide
color-edge protection; luminance texture does not block that correction. The
reconstruction preserves linear Rec.2020 luminance and alpha, without clipping
HDR or negative values. Images smaller than 96 pixels on either axis bypass
this broad-color stage. No full-resolution collaborative filter is repeated.

`index.ts` owns RGB filtering and its temporary textures. `cache.ts` shares
results by image source and absolute white balance between preview and export.
Each Bayer white balance develops the already filtered sensor; it does not repeat
sensor filtering, but recomputes the developed chroma correction. The RGB fallback recalculates for a changed RAW white balance.
The renderer reuses transient targets for the amount-blend node. Closing the final renderer releases cached
images and the private sensor, aborting pending Bayer work. The document owns
the original sensor independently.

## Cost and precision

RGB scratch tiles stay below 9 MiB, plus full-image outputs and approximately
92 MiB of reduced images at 24 MP. Bayer filtering instead allocates three packed
RGBA32F images: approximately 275 MiB at 24 MP, plus a 512 KiB accumulation buffer
and a temporary 46 MiB integer output. The private decoded sensor, developed
images and existing editor allocations are additional. Each full-resolution
RGBA16F cached result adds approximately 183 MiB at 24 MP. Blend outputs use
the renderer's transient target pool.

Bayer chroma cleanup temporarily adds a full-resolution RGBA16F output (183 MiB
at 24 MP), half/quarter-resolution images and the reduced RGB filter's scratch.
The completed result replaces the private development, which is then released;
steady-state caching retains one developed result per white balance. The collaborative work starts at 1/16 of the original image area;
its pyramid adds smaller levels. Halo and minimum-tile overhead remain, so this
is not a measured 16-fold speedup. Reduced graph targets and filter scratch are
released after preparation. The extra work occurs once per cached white balance,
not on slider, exposure, or curve changes.

GPU submissions are bounded by a completion wait between accumulation tiles.
This limits queued work, not total image memory or first-use latency. Packing
and overlap accumulation use FP32; the developed working image uses RGBA16F.
RGB alpha and translucent boundaries bypass filtering.

## Verification and provenance

Browser fixtures check exported pixels for noise error, color bias, texture,
alpha, tile boundaries and exact zero bypass. A 320×320 Bayer detail pair from
the local experiment additionally checks clean-image preservation. A correlated
Bayer fixture checks broad chroma noise, fine stripes, shadows, a color edge and
a small red light at exposure +2 EV. Bun tests
cover cache ownership, grouped edits, coalesced preparation, retries, cancellation
and the robust shot/read fit; mocks do not execute shaders.

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

## Reproducing measurements

Run `bun run test:browser --config playwright.bench.config.ts denoise.bench.ts`.
The offscreen benchmark records decoding and first-use latency separately from
repeated completed renders (8 warmups, 40 samples), then times the actual blend
pass on 5000×4000 RGBA16F textures. React, display, export encoding and timing
readback are outside the repeated-render interval. The expensive filter's compute
dispatches are not timestamped; its first-use figure is a single diagnostic sample.
Follow [the measurement and evidence rules](../../../../PERFORMANCE.md); keep results in the PR.
Use hardware measurements to assess the 120 FPS budget; SwiftShader is not a proxy.
