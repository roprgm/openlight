# Detail filter proposals

Research date: 2026-09-05. Status: proposals, with an initial Clarity experiment described in [the calibration report](clarity-calibration.md). Sharpening and texture remain proposals.

Propose three distinct controls: sharpening with a radius for fine edges, texture for medium detail, and clarity for broader local contrast. Start with a small, measurable implementation of each. Fit its response to reference exports before choosing final scales, slider mappings, or safeguards.

## What the evidence supports

Public engineering notes describe sharpening as a high-frequency operation, texture as a medium-frequency operation, and clarity as a broader operation extending into lower frequencies. Texture can increase noise when the noise occupies its selected band. Clarity can alter luminance and saturation more than texture. Those descriptions establish intended behavior, but do not disclose kernels, working spaces, thresholds, or exact scale selection. A difference of Gaussians is therefore a candidate for texture, not a recovered proprietary algorithm. [Primary engineering explanation](https://blog.adobe.com/en/publish/2019/05/14/from-the-acr-team-introducing-the-texture-control).

Published sharpening controls separate amount, radius, detail, and edge masking. Radius determines the size of affected detail. A public edit API accepts a sharpening radius of 0.5 to 3.0, but that does not establish that the internal Gaussian sigma equals the displayed number. Keep detail and masking fixed during a radius experiment. [Control definitions](https://helpx.adobe.com/uk/lightroom/web/edit-photos/apply-effects/adjust-details.html), [Public edit parameters](https://developer.adobe.com/firefly-services/docs/lightroom/guides/apply-edits/).

Two open-source sharpening implementations give useful, inspectable baselines. One subtracts a separable Gaussian blur from lightness, applies a soft threshold to the residual, and adds an amount-scaled result. Its GPU path has horizontal blur, vertical blur, and mix kernels. Another includes Gaussian unsharp masking, a contrast mask, optional edge-aware preprocessing, and attenuation of values that overshoot neighborhood extrema. It also contains iterative deconvolution. These are alternatives with different costs and failure modes. [Separable sharpening source](https://github.com/darktable-org/darktable/blob/master/src/iop/sharpen.c), [Masked sharpening and deconvolution source](https://github.com/RawTherapee/RawTherapee/blob/dev/rtengine/ipsharpen.cc).

An inspected multiscale implementation builds directionally weighted low-pass levels, forms fine-minus-coarse residuals, and scales their contributions during reconstruction. It uses scale-dependent noise thresholds and reduces gains at coarse levels to limit artifacts. This supports treating scale selection and residual gain as separate decisions. [Directional pyramid source](https://github.com/RawTherapee/RawTherapee/blob/dev/rtengine/dirpyr_equalizer.cc).

A local-contrast implementation uses Gaussian/Laplacian pyramids with local tonal remapping. Its local contrast term adds an odd, Gaussian-shaped adjustment around a reference intensity. The associated method separates large edges from detail by remapping intensities before selecting pyramid coefficients. It was designed to avoid the halos of ordinary broad detail amplification. [Local remapping source](https://github.com/darktable-org/darktable/blob/master/src/common/locallaplacian.c), [Original paper and supplementary materials](https://people.csail.mit.edu/sparis/publi/2011/siggraph/).

An alternative diffusion method operates on linear RGB using an iterative multiscale solver. Its documentation specifies radii in full-resolution image pixels and warns about processing cost. Propose leaving that approach out of the first experiment: the initial requirement is controllable detail contrast, and a solver would add several parameters before we have measurements to justify them. [Diffusion method and scale definitions](https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/diffuse/).

Source links track the inspected development branches and may change. Before adapting any source implementation, record a commit and review its license. The formulas below are experimental design proposals rather than copied implementation code.

## Proposed sharpening

Use a luminance-domain unsharp mask first. For a scalar signal `L`, define a normalized Gaussian blur `G_sigma`, a residual `d`, a threshold `tau`, and an amount `a`:

```text
d = L - G_sigma(L)
soft(d, tau) = sign(d) * max(abs(d) - tau, 0)
L_out = L + a * soft(d, tau)
```

For the first diagnostic run, set `tau = 0` and omit adaptive masking. That makes the frequency and edge responses interpretable. Then add a smooth contrast mask only if noise patches show that it is needed. Thresholds distinguish amplitude, not semantic detail, so they will also suppress weak real texture.

Propose a visible radius range of 0.5 to 3.0 source pixels with a default of 1.0. Start with `sigma = radius` internally and label this mapping provisional. Sample the Gaussian on the pixel grid, truncate at `ceil(3 * sigma)`, and normalize its weights. The finite, sampled kernel is the actual model at small radii; a continuous Gaussian formula alone will not predict a half-pixel-radius result accurately.

Expose an amount whose zero is an exact bypass. Calibrate its gain separately from radius. Increasing amount should primarily change edge amplitude; increasing radius should broaden the edge response. A fixed 3-by-3 sharpening kernel cannot satisfy that radius requirement.

For halo control, compare a smooth attenuation of excursions beyond local extrema against unrestricted output. Avoid an unconditional clamp to the neighborhood range: it can remove the desired increase in edge contrast. Use high-contrast steps to measure peak overshoot and low-contrast steps to ensure that protection has not disabled sharpening everywhere. Deconvolution remains a later option if blurred-edge targets reveal a requirement that this baseline cannot meet.

## Proposed texture

Start with a band-pass residual that leaves both the finest noise and the broadest shading less affected:

```text
b = G_sigmaSmall(L) - G_sigmaLarge(L)
L_out = L + t * b
```

Positive `t` increases the selected detail; negative `t` reduces it. Try sigma pairs `1, 4`, `2, 8`, and `4, 16` source pixels as separate experiments, not fixed product constants. A Gaussian sigma is not a square width or a sine-wave period. For the continuous, unmasked approximation, the gain at spatial frequency `f` in cycles per pixel is:

```text
H(f) = 1 + t * [exp(-2*pi*pi*sigmaSmall^2*f^2)
               - exp(-2*pi*pi*sigmaLarge^2*f^2)]
```

This provides a prediction to compare with the chart's sine patches. Sharp squares contain many harmonics, so they reveal visible artifacts but cannot identify a filter's passband alone.

If one band is insufficient, use a few overlapping pyramid bands with smooth weights. Do not immediately expose separate scale controls. Fit the internal weights while keeping the product control simple. A Gaussian band-pass can still produce halos on strong edges; if those dominate, compare edge-aware decomposition or coefficient attenuation. Measure that change separately because it makes response depend on local contrast.

Propose `-100..100`, default zero. Fit positive and negative slider curves independently. Negative texture should reduce selected medium detail while retaining fine edges and broad shading. It is not a substitute for noise reduction.

## Proposed clarity

Follow-up primary evidence supports prioritizing local Laplacian experiments: an algorithm author's product notes explicitly connect a released clarity adjustment to that research. The wording establishes historical influence, not the exact current filter or its parameters. [Author's implementation history](https://people.csail.mit.edu/sparis/).

Use a broad, low-gain unsharp residual as a diagnostic baseline. Test sigma values of `16`, `32`, and `64` source pixels and measure their halo widths. This baseline is cheap to understand, but its halos may rule it out as the final effect.

For the next candidate, use a Laplacian pyramid and remap selected broader bands while preserving the coarsest residual. Favor small and medium local intensity differences; taper the gain across strong edges. A local Laplacian implementation is a stronger candidate when simple Gaussian bands cannot preserve those edges. Merely multiplying ordinary Laplacian coefficients is not the same algorithm as local Laplacian filtering.

A concrete accelerated implementation evaluates a small set of intensity anchors. Its remapping has the form `r_g(v) = g + beta*(v-g) + alpha*z*exp(-z*z/2)`, where `z = (v-g)*(N-1)` and `g = k/(N-1)`. It builds a pyramid for each anchor, then interpolates neighboring remapped Laplacian coefficients using the original Gaussian coefficient at that position and scale. The inspected example uses separable `[1,3,3,1]/8` downsampling and bilinear reconstruction. Its intensity-anchor count also controls the remapping width, so separate those parameters when fitting an effect. Set `beta = 1` for the first detail-only experiment. These are public example parameters, not reference-product parameters. [Accelerated implementation](https://github.com/halide/Halide/blob/main/apps/local_laplacian/local_laplacian_generator.cpp), [Acceleration paper and materials](https://imagine.enpc.fr/~aubrym/projects/llf/index.html).

Propose `-100..100`, default zero, with lower gain than texture for a given residual amplitude. Test whether shadows and highlights need reduced gain. Do not make a midtone mask a requirement until the repeated patterns on different gray backgrounds show a tonal dependence. Likewise, do not add a saturation change solely because some references exhibit one; measure whether it comes from luminance reconstruction, clipping, or a separate color operation.

## Working space and pipeline

The current renderer applies adjustments and tone curves at image resolution, then converts for display. Export creates the same renderer at the document's dimensions. The working textures use linear Rec.2020, and the shared luminance function uses coefficients `0.2627, 0.6780, 0.0593`. [Renderer](../../src/lib/editor/renderer.ts), [Color functions](../../src/lib/color.wgsl), [Export](../../src/app/editor/export/export-image.ts).

Propose deriving scalar luminance `Y` from that existing function, filtering a scalar representation, and reconstructing linear RGB. Do not filter sRGB-encoded bytes as though they were linear light. Compare two scalar representations during calibration:

- `L = Y` for a direct linear baseline.
- `L = asinh(Y / k)` for a signed, compressive representation that remains defined at zero and for negative values. The scale `k` is a fitted parameter, not an established constant.

Invert the representation after filtering. For positive luminance away from zero, multiplying RGB by `Y_out / Y` preserves channel ratios before gamut handling. This requires explicit treatment near black. As a candidate, smoothly blend toward adding the same luminance delta to each channel near zero, and test saturated shadows for color shifts. Neither reconstruction guarantees constant perceived saturation. Preserve alpha and avoid introducing an intermediate display-range clamp. Decide transparent-pixel sampling from the existing source-alpha convention before implementation.

Initially place creative texture and clarity after tone curves and before display conversion, followed by sharpening. This makes the first experiment easy to isolate using the renderer's existing output. Treat this order as provisional. Capture-style sharpening may belong earlier, and tonal transforms change the residuals seen by all three controls. Test nonzero exposure and curves after fitting neutral-chart responses.

Use source-pixel radii for the first implementation so panning, zooming, and device pixel ratio cannot change the result. To determine whether texture or clarity should instead scale with image dimensions, compare independently generated versions of the same chart at two resolutions. Do not infer a size rule from a single image or from a downsampled preview.

## GPU ownership and cost

Propose one imperative detail-effect owner composed by the renderer. It owns pipelines and temporary targets, returns the final target, and disposes its resources. The scene stores only serializable control values. React mounts controls; it does not hold filtered pixels or pyramid levels.

Start sharpening with two separable blur passes and one reconstruction pass. Two independent Gaussian scales for texture need four blur passes plus a mix; incremental blurs can share work because Gaussian variances add. Validate any reuse against the chosen discrete kernel, since truncation and sampling make it approximate. Share intermediates only where the input and scale definitions actually match.

For broad clarity, a downsampled pyramid avoids running a wide kernel at full resolution. Low-pass before decimation and use consistent reconstruction to avoid phase-dependent artifacts. A half-width, half-height pyramid contains less than `4/3` of the original pixel count per scalar pyramid; local Laplacian remapping can require multiple pyramids and much more work.

At 24 megapixels, one `rgba16float` target is about 192 MB in decimal units. A full-resolution scalar `r16float` target would be about 48 MB, if supported by the chosen vgpu operations and device. Budget target count before selecting a pyramid design. Benchmark GPU time and peak allocation on a real large image; do not infer performance from the small chart or pass count alone. Bypass all detail allocations and passes when every amount is zero if the owner lifecycle makes that practical.

## Calibration proposal

Use [the test chart](detail-filters-test-chart.png) and [its companion guide](detail-filters-test-chart-guide.md). Export one neutral reference before changing controls. Keep the original dimensions, output color space, process version, profile, and all unrelated edits fixed. Disable output sharpening, resizing, grain, lens corrections, noise reduction, and automatic edits. Explicitly set sharpening amount to zero for isolated texture and clarity tests; reset defaults may contain sharpening.

Start with this series, always editing the same original rather than a prior export:

| Series | Settings varied | Settings held fixed |
| --- | --- | --- |
| Neutral | All three amounts zero | All processing and export settings |
| Sharpen amount | 25, 50, 100 | Radius 1.0; detail and masking recorded and fixed |
| Sharpen radius | 0.5, 1.0, 2.0, 3.0 | Amount 50; same detail and masking |
| Texture | -100, -50, -25, 25, 50, 100 | Sharpening and clarity zero |
| Clarity | -100, -50, -25, 25, 50, 100 | Sharpening and texture zero |

Lossless full-resolution exports are preferable to screenshots or JPEG. Use tagged sRGB consistently for the first comparison; preserve 16-bit exports when available. Save exact settings or a sidecar with every reference.

The current import path stages decoded pixels in `rgba8unorm-srgb` before producing its floating-point working target. The 16-bit chart therefore loses precision on import, and canvas export can quantize the result again. A neutral subtraction cannot fully cancel this difference when thresholds or nonlinear filters respond to the quantized input. Keep the 16-bit master for reference research, but use an identical, explicitly quantized 8-bit derivative in both pipelines for controlled algorithm matching, unless a later implementation changes import precision. Measure the neutral round trip to establish the remaining floor. [Import staging](../../src/lib/decode/linearize.ts).

Compare each processed export against its own neutral export. First verify matching dimensions and pixel alignment without resampling. Then compare those effect deltas between implementations. This separates much of the import/export color conversion from the detail operation, though nonlinear pipeline differences can still affect the result.

Measure sine-wave amplitude and phase over complete cycles away from patch boundaries, edge overshoot and halo width, mean patch drift, noise RMS by scale, and color changes across chromatic edges. Inspect gradients for new steps or reversals. Compare low and high contrast at the same size to detect adaptive behavior. Fit on some patch families and reserve others to check whether the model generalizes. Repeated export of the neutral image establishes the measurement floor.

The atlas has finite patch sizes. A broad filter can sample labels, borders, or neighboring patches even when the measurement region excludes them. Exclude a margin at least as large as the effective filter support for isolated response measurements. If too few complete cycles remain, generate a larger standalone patch. Applying an exact candidate to the entire chart remains a valid comparison, provided the analysis includes the same surroundings rather than assuming an isolated patch.

Only after these isolated fits, test combined controls and real photographs containing skin, foliage, fabric, fine hair, and noisy shadows. The synthetic chart identifies scale and artifacts; it cannot establish perceptual quality on its own. A PNG comparison also does not establish RAW behavior, where demosaicing and capture sharpening may differ.

## Proposed implementation decision

Proceed first with separable unsharp masking for sharpening and a measured band-pass candidate for texture. Prototype broad Gaussian clarity solely as a baseline, then keep it only if halo measurements are acceptable; otherwise evaluate local Laplacian remapping. Leave numerical weights, tone dependence, scale normalization, and slider curves uncommitted until reference exports distinguish them. Matching public descriptions is achievable now. Matching an undisclosed implementation requires those measurements.
