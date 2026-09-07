# Proposal to simplify clarity

Implemented on 2026-09-06. The shader uses the sRGB transfer of Rec.2020 luminance, a fixed 64-source-pixel Gaussian sigma, and `a = slider / 200`. Thus the slider covers -0.5 to +0.5: the softest setting retains half the local detail. The earlier direct mapping to -1 removed too much detail in the city photograph used for visual checking. This strength limit is a product choice, not a reference fit.

The initial simplification had one 50-line WGSL shader and a 62-line GPU owner, down from 158 combined lines. On 2026-09-07, these became the shared `lib/unsharp-mask` implementation used by [sharpening](sharpening.md), preserving the Clarity parameters. Four passes perform reduction, horizontal blur, vertical blur, and reconstruction. The reduced blur keeps the wide neighborhood affordable; no full-resolution wide convolution or precomputed kernel buffer is needed. The shader computes Gaussian weights from the radius and normalizes them. Alpha weights the neighborhood and remains unchanged; near-black pixels can brighten under negative Clarity. No new abstraction or dependency was added for this simplification.

Browser tests compare both slider directions and intermediate strengths with an independent full-resolution Gaussian calculation, within two 8-bit code values at the measured step positions. They also check black edges, flat fields, transparent neighbors, odd image dimensions, undo/reset, histograms, and edited exports. Reference-export errors remain diagnostic and are no longer the acceptance criterion for this simpler algorithm.

The refreshed atlas sweep has median error 4 at -100 and 12 at +100 against the reference exports, compared with 1 and 4 for the superseded fitted model. This simplification intentionally gives up that numerical fit. Mean errors are 7.330 and 13.496, and 95th percentiles are 25 and 31. After warm-up, native render plus readback took about 18–28 ms at 4096 by 4096. The city photograph was checked visually at both extremes; this is a limited visual check, not a broad photographic validation set. Strong positive settings retain the halo risk of unsharp masking.

Use a conventional local-contrast operation with an explicit amount and radius. Remove reference-specific response fitting from this proposal's success criteria. A useful clarity effect does not require reproducing every pixel of a proprietary control.

Clarity describes an editing intent: strengthen or soften contrast within nearby regions so surface detail and shapes become more or less pronounced. It does not identify one shared equation. Public implementations use different algorithms, including broad unsharp masking, an unnormalized bilateral filter, and local Laplacian filtering. These are established techniques, but their coexistence is evidence against treating the control name as a standardized numerical operation. [Broad local-contrast method](https://rawpedia.rawtherapee.com/Local_Contrast), [Alternative local-contrast methods](https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/local-contrast/).

## Verified implementation details

One inspected implementation processes only perceptual lightness. It computes a Gaussian blur with `sigma = radius / processingScale`, subtracts that blur from the original, multiplies the residual by amount, and adds it back. Optional controls scale positive and negative changes separately. With those controls both set to one, its equation is ordinary unsharp masking. It clamps the result to its internal lightness range. An alternate execution path uses FFT convolution for the blur. [Implementation](https://github.com/RawTherapee/RawTherapee/blob/dev/rtengine/iplocalcontrast.cc).

Another implementation explicitly selects between a bilateral-grid path and local Laplacian processing. The bilateral path creates a grid, splats pixels, blurs, and slices with a detail parameter. The other path calls the local Laplacian implementation with tonal-remapping parameters. These additional stages address edge behavior and tonal control; they are not necessary merely to compute local contrast. [Mode selection and execution](https://github.com/darktable-org/darktable/blob/master/src/iop/bilat.c).

## Proposed operation

For scalar luminance or lightness `L`, a normalized Gaussian `G` with standard deviation `r`, and signed amount `a`:

```text
base = G_r(L)
detail = L - base
result = L + a * detail
```

Positive amount increases local contrast. Negative amount softens it. At `a = -1`, the result is the blurred base. Zero amount and constant images remain unchanged. Small radii emphasize fine edges; larger radii affect broader shapes and shading. These properties follow directly from the equation.

Propose keeping two meaningful parameters: amount and radius in source pixels. Define radius as Gaussian sigma rather than leaving its meaning implicit. Document the slider's strength range and the selected fixed radius as design choices. There is no universal clarity radius or universal meaning for a slider value of 100.

Use one explicit luminance/lightness representation and the app's color reconstruction policy. Linear luminance and perceptual lightness produce different results; choosing one is still necessary even with a simple equation. Avoid adding a fitted gamma, separate positive/negative response curves, or scene-dependent correction terms merely to imitate reference exports.

A separable Gaussian needs horizontal and vertical blur passes followed by reconstruction. For wide radii, a reduced-resolution blur can reduce cost, provided it low-passes before reduction, preserves pixel alignment, and scales the radius consistently. The kernel weights come from the Gaussian equation and normalization; they need no fitted table of reference-specific coefficients.

## Tradeoff and acceptance

Broad unsharp masking can create bright and dark halos at strong boundaries and amplify noise. This is a known limitation of the technique. Edge-aware alternatives can reduce those artifacts, but add parameters, processing, and their own failure modes. [Edge behavior analysis](https://www.darktable.org/2012/09/edge-aware-image-development/).

Propose judging the simpler effect by predictable radius, unchanged flat fields, symmetric signed response before clipping, useful results on real photographs, and acceptable halos at ordinary amounts. Retain the chart and probes for checking those properties. Exact reference matching should be a separate requirement with its own complexity budget.
