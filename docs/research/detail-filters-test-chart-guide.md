# Detail filter calibration chart

Use [the 8-bit comparison PNG](detail-filters-test-chart-8bit.png) for the first matching experiment. Keep [the 16-bit master](detail-filters-test-chart.png) for higher-precision experiments. Both are 4096 by 4096, opaque RGB, tagged sRGB, and contain the same patterns. The [preview](detail-filters-test-chart-preview.png) is only for navigation. Do not import the preview as a test source.

The chart was generated mathematically. The [measurement manifest](detail-filters-test-chart.json) records 111 regions, their coordinates, parameters, and file hashes. No application code changed. The [filter proposals](detail-filters.md) explain the candidate algorithms and research evidence.

## Why two bit depths

The current [image upload path](../../src/lib/decode/linearize.ts) stages pixels in `rgba8unorm-srgb` before conversion to linear Rec.2020. A 16-bit input therefore does not retain 16-bit precision through the app. Use the same 8-bit input in both editors for the first comparison, and still export the results at 16 bits if available. This preserves fractional values created by filtering in the reference export.

The 8-bit image is derived from the master's integer samples by `round(sample / 257)`. Nominal amplitudes in the manifest describe the unquantized design. Measure actual amplitudes from the selected input, especially in the lowest-contrast patches. Equal-luminance color pairs are approximate after quantization.

## What each section measures

| Section | Patterns | What to look for |
| --- | --- | --- |
| 01 | Sine periods 4, 8, 16, 32, 64, 128, 256, 512 pixels; peak-to-peak contrasts 0.02, 0.10, 0.40 | Frequency gain, contrast dependence, unwanted phase shifts |
| 02 | Checker square sides 1, 2, 4, 8, 16, 32, 64, 128 pixels; the same three contrasts | Fine-detail response, ringing, aliasing and orientation artifacts |
| 03 | Hard steps with amplitudes 0.01, 0.04, 0.10, 0.20 at means 0.10, 0.50, 0.90 | Tone-dependent gain, halos, clipping and weak-detail thresholds |
| 04 | Vertical, horizontal and 5-degree slanted steps; Gaussian sigma 0, 0.5, 1, 2, 4, 8, 16, 32 pixels | Radius, directional consistency and response to already blurred edges |
| 05 | Encoded linear ramp, smoothstep ramp, logarithmic chirp with period falling from 512 to 4 pixels | Banding, gradient reversals and approximate location of the affected frequency band |
| 06 | Bright and dark isolated squares, sides 1 through 128 pixels; fine texture on a strong step below them | Spread of halos, bright/dark asymmetry and suppression of texture near an edge |
| 07 | Seeded noise blurred at sigma 0, 1, 2, 4, 8, 16, 32, 64 pixels; each tile normalized to RMS 0.025 and mean 0.50 | Noise amplification and sensitivity to texture scale |
| 08 | Red/green and blue/green steps, sine waves and checks at constant linear luminance; neutral controls | Chroma leakage and unintended color or luminance changes |

Unless specified as linear, values use encoded sRGB in the range zero to one. Contrast means peak-to-peak sample difference, not Michelson contrast. A checkerboard's axial period is twice its square side. The sine periods are independent of the checker sizes.

The blurred edges sample an analytic error-function step at pixel centers. Sigma zero is a hard sampled step. They are not optical targets with a modeled pixel aperture. Noise tiles share one Gaussian realization seeded with `20260905`, use periodic Fourier-domain Gaussian filtering, and are independently normalized after filtering. The normalization intentionally holds RMS constant while changing spatial scale.

Color patterns start in linear sRGB at `[0.25, 0.25, 0.25]`. Red/green modulation follows `[1, -0.2126/0.7152, 0]`; blue/green follows `[0, -0.0722/0.7152, 1]`. Each has amplitude 0.15 before sRGB encoding. These directions preserve the stated linear luminance before quantization. The final two patches are neutral linear-luminance steps with amplitudes 0.02 and 0.20.

## Reference capture

1. Import the full-resolution 8-bit comparison PNG. Record application version, process version, selected profile and any import preset. Disable automatic edits, HDR processing, lens corrections, denoising, grain, geometry changes and local masks. Keep white balance, tone controls and curves neutral and fixed.
2. Explicitly set sharpening amount, texture and clarity to zero. Export this as `baseline.png`. Do not assume a reset preset disables sharpening. Record the fixed sharpening detail and masking settings even when amount is zero.
3. Always start each variant from that same neutral source. Change one control at a time. A compact first batch is below; the proposals contain a denser follow-up sweep.
4. Export at exactly 4096 by 4096, tagged sRGB, preferably 16-bit PNG or 16-bit TIFF with lossless compression. Disable resizing, output sharpening and watermarking. Keep the same export settings for every variant. Export controls can add a separate sharpening step, so record them too. [Export settings reference](https://helpx.adobe.com/lightroom-classic/desktop/export-photos/export-files-disk-or-cd.html).
5. Save settings beside the outputs or retain a sidecar. Include exact amounts, radius, detail, masking, profile, process version and export bit depth. Use screenshots only to record settings, not as measurement images.

| Export name | Changed setting |
| --- | --- |
| `baseline.png` | All three effects zero |
| `sharpen-a50-r0.5.png` | Sharpen amount 50, radius 0.5 |
| `sharpen-a50-r1.png` | Sharpen amount 50, radius 1 |
| `sharpen-a50-r2.png` | Sharpen amount 50, radius 2 |
| `sharpen-a50-r3.png` | Sharpen amount 50, radius 3 |
| `texture-minus100.png` | Texture -100 |
| `texture-minus50.png` | Texture -50 |
| `texture-plus50.png` | Texture +50 |
| `texture-plus100.png` | Texture +100 |
| `clarity-minus100.png` | Clarity -100 |
| `clarity-minus50.png` | Clarity -50 |
| `clarity-plus50.png` | Clarity +50 |
| `clarity-plus100.png` | Clarity +100 |

Use `.tif` instead when exporting TIFF. All unlisted effects remain zero. Fixed detail and masking values should be identical across the four sharpening exports. If a listed value is unavailable in the installed version, record the actual value instead of silently substituting it.

## Measurement limits

Compare full-resolution pixel data. Reduced previews hide fine patterns and can create moire. DPI metadata does not change the spatial frequencies; resizing does.

Coordinates are zero-based with a top-left origin. Each manifest rectangle is `[x, y, width, height]` with an exclusive far boundary. Labels and gutters lie outside the rectangles. Exclude them from metrics, but remember that a broad filter can sample them and change nearby pixels inside a rectangle.

Most narrow strips are 96 pixels tall. A Gaussian truncated at three sigma needs at least `ceil(3 * sigma)` pixels of margin from every unrelated boundary. Sigma 16 already consumes an entire 96-pixel strip vertically. Large-scale filters therefore cannot be treated as operating on isolated patches in this atlas. The longest sine patch does not even contain a complete 512-pixel cycle. Use those patches for qualitative response or compare a candidate applied to the complete original atlas, including its surroundings. Do not report their amplitude ratios as an uncontaminated transfer function.

For quantitative broad-scale fitting, follow up with standalone full-frame sine waves and steps, with several cycles and adequate margins. Repeat at a second resolution to test whether a radius uses source pixels or image-relative scale. Do not estimate an unknown filter from a cropped patch that was processed in the context of the full chart.

First compare each editor's neutral export with its input. Then compare the effect delta, `processed - neutral`, between editors at matching coordinates. Measure edge profiles, halo extent, mean drift, sine gain and noise RMS in suitable regions. Check both encoded values and linear luminance with the domain stated explicitly. A neutral subtraction cannot fully remove input quantization or nonlinear pipeline differences. Set tolerances using the neutral mismatch and repeated exports before fitting filter constants.

The chart contains clipping stress cases deliberately. Shadow and highlight steps of amplitude 0.20 reach zero or one, so avoid those patches when estimating an unclipped linear gain. Keep them for testing highlight and shadow protection.

Synthetic patterns establish response and failure modes. A later check on real photographs is still needed for natural texture and subjective quality.
