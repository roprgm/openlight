# Clarity calibration experiment

Superseded on 2026-09-06 by the [Gaussian simplification](clarity-simplification.md). The formulas and measurements below describe the earlier fitted experiment, not the current shader. The comparison script still works and writes measurements for the current implementation.

2026-09-05. The slider, shader, and automated comparison are implemented. The requested near-zero reference match is **not achieved**. Negative amounts are close on the measured images; positive amounts remain an approximate baseline with substantial residual errors.

## Reference controls

The atlas comparison uses `public/debug/export.png` as input. Embedded metadata identifies that file as the source of the nine clarity exports. Using the earlier chart master instead introduces an additional small import difference. References cover -100 through +100 in steps of 25, including zero. Their metadata records process version 15.4, application version 9.3.1, texture zero, sharpening zero, neutral tonal edits, and sRGB output. All comparisons use aligned 4096-by-4096 PNGs without resizing.

Two additional controls test whether the atlas fit generalizes:

- `clarity-probe.png` contains four constant quadrants. Upper left/right are 115/140; lower left/right are 51/204. The boundaries lie at x and y 2048. Exports exist at -100, 0, and +100.
- `clarity-flat.png` contains only RGB 115. Its +100 reference remains 115–116. This rules out a fixed tone correction that changes uniform gray.

At -100, the probe changes mainly near its boundaries. At +100, it changes distant plateaus as well. For example, upper-left gray 115 becomes about 97 far from the vertical boundary, while upper-right gray 140 becomes about 120. The flat control shows that these shifts depend on image content. A local edge residual alone cannot explain them.

## Current proposal

Keep one shader source with four rendering passes: reduce luminance moments, blur horizontally, blur vertically, then reconstruct RGB at the original resolution. A single full-resolution pass would need an impractically wide neighborhood for these radii. The temporary images are one-sixteenth the source width and height; the final output retains the source format and dimensions.

The renderer places Clarity after tonal adjustments and the tone curve. The scene stores `clarity` in UI units, default zero, range -100 to +100. Zero returns the input target directly. The effect owner creates reusable resources and disposes its targets. Each pass has its own uniform buffer; the shader pipeline is shared. The current owner allocates its output eagerly, including when the amount is zero.

Derive Rec.2020 luminance `Y`, apply the sRGB transfer function to obtain scalar `e`, and filter luminance rather than RGB channels independently. Reconstruct with `RGB_out = RGB * Y_out / max(Y, 1e-6)`. Alpha weights the local moments and is retained in the output. Shader tests cover transparent neighbors and nonmultiples of the reduction size.

For negative amounts, the Gaussian sigma is 64 source pixels. With local mean `m`, variance `v`, `d = e - m`, and `t = e - 0.5`:

```text
detail = d * (-2.693394 - 0.214867*d - 5.543464*t)
bias = v * (4.318646 + 8.875217*t - 7.998854*t*t)
u = -clarity / 100
strength = u * (1.3 - 0.3*u)
e_out = max(e + strength*e*max(1-e, 0)*(detail+bias), 0)
```

The six coefficients were fitted jointly to atlas and probe samples at -100. The amount curve follows the intermediate negative exports. Variance-dependent bias vanishes on a constant field, unlike a fixed tone correction. The endpoint weight also leaves luminance above display white unchanged for negative amounts.

For positive amounts, sigma is 256 source pixels. Filter `L = e^0.7`, form `d = L - mean(L)`, and use:

```text
change = (clarity/100) * 0.8797 * d
         * exp(-(d/0.2944)^2) * (1-exp(-e/0.0609))
e_out = max(L + change, 0)^(1/0.7)
```

These constants describe the experimental fit. They are not a recovered reference formula. Radii currently use source pixels; resolution scaling remains unmeasured. Color reconstruction, HDR inputs, real photographs, and combined adjustments need broader reference calibration.

## Measured errors

Errors below are absolute differences in encoded 8-bit RGB values, pooling all three channels and all pixels. Alpha is excluded. Median zero alone does not establish a match, so the script also records mean, 95th percentile, maximum, and each of the chart's 111 measurement regions.

| Clarity | Median | Mean | 95th percentile | Maximum |
| ---: | ---: | ---: | ---: | ---: |
| -100 | 1 | 1.453 | 5 | 31 |
| -75 | 1 | 1.180 | 4 | 25 |
| -50 | 1 | 0.884 | 3 | 19 |
| -25 | 0 | 0.567 | 2 | 12 |
| 0 | 0 | 0.010 | 0 | 1 |
| +25 | 1 | 1.832 | 5 | 30 |
| +50 | 2 | 3.263 | 9 | 52 |
| +75 | 3 | 4.460 | 13 | 78 |
| +100 | 4 | 5.553 | 17 | 102 |

The neutral result establishes an approximately one-code-value round-trip floor. Restricting the comparison to channel samples changed by more than one value in the reference gives median 1 for every negative amount, including -25. At -100 the active-sample mean is 1.645. The full-image median should therefore not be read as exact recovery of every changed detail.

The independent probe at -100 has median 0, mean 0.088, 95th percentile 1, and maximum 5. Its +100 result has median 16, mean 13.633, 95th percentile 28, and maximum 57. The positive baseline misses the broad shifts described above.

Errors also concentrate in specific atlas regions. At -100, the midgray step with contrast 0.2 has mean error 6.63. At +100, the one-pixel checker with contrast 0.4 has median 33 and mean 31.72. A low overall median would hide these failures.

Native GPU render plus readback generally took approximately 16–30 ms per 4096-square image after shader compilation on the development machine. This is not an isolated GPU timing measurement. PNG encoding and reference loading happen outside that timed interval. Compilation and concurrent workloads can increase the first measurement.

## Rejected candidates

The experiments included Gaussian unsharp residuals in several intensity spaces, box kernels, bilateral residuals, local mean/variance models, and Gaussian/Laplacian pyramids with local remapping. Public research provides an informed starting point but does not specify the current reference filter. [Historical implementation evidence](https://people.csail.mit.edu/sparis/), [Local Laplacian paper](https://people.csail.mit.edu/sparis/publi/2011/siggraph/), [Accelerated implementation](https://github.com/halide/Halide/blob/main/apps/local_laplacian/local_laplacian_generator.cpp).

A grouped local-Laplacian fit evaluated full-resolution remapping, fine-scale contributions, three scale groups, gamma and linear intensity spaces, three range widths, and shadow/midtone masks. Its best positive joint result had atlas mean 6.75 and probe mean 13.13. Adding those passes did not improve the selected baseline sufficiently.

A three-Gaussian moment model with sigmas 64, 1024, and 2048 and 36 polynomial coefficients did improve the two calibration images. Its actual GPU +100 atlas median was 3 and mean 3.719; probe median was 2 and mean 1.996. But the same model darkened the center of the smaller 1200-by-800 editing fixture from 128 to 56. That fixture has no reference Clarity export, so this is a generalization concern rather than a measured reference mismatch. The model was rejected pending evidence for its resolution rule and tonal behavior. Its additional fit parameters are not included in production code.

## Reproduce and continue

Run from the repository root with a native GPU available:

```sh
bun run test:clarity
bun run test:clarity public/debug 100
bun run test:clarity public/debug -100 clarity-probe
bun run test:clarity public/debug 100 clarity-probe
bun run test:clarity public/debug 100 clarity-flat
```

The first command evaluates all nine atlas references. A single amount limits the run. The optional series changes the source to `<series>.png` and references to `<series>-minus100.png`, `<series>-0.png`, or `<series>-plus100.png`, with analogous intermediate names. Results and rendered PNGs go to `<series>-results/` under the chosen directory. Each invocation replaces that series' `metrics.json`; one-amount runs report that amount only. The report records decoded source/reference pixel hashes, validation errors cause failure, and the atlas sweep includes per-region and active-sample errors. The private reference exports must exist locally; they are not required by CI.

For programmatic orchestration, import `createClarity` from `src/lib/clarity/index.ts`, construct it with a GPU and source target, then call `clarity.render(frame, input, amount)`. Its returned target can feed later passes. Call `dispose()` when its owner releases the image. `vgpu/mock` supports this same interface for lifecycle checks but does not execute WGSL. Pixel comparisons use `vgpu/node`; browser tests exercise the complete import, renderer, and export path.

Propose defining the next matching threshold as median at most 1 and 95th percentile at most 2 on active samples in every measured patch family, with independent controls passing too. The present implementation fails that threshold. Before adding further positive coefficients, export the sparse probe and an independent photograph at multiple resolutions. Distinguish source-pixel radii from image-relative scales, then measure the broad tonal response. Keep flat-field identity as a constraint. A final simplification should follow that evidence rather than preserve a more complex fit solely because its atlas score improves.
