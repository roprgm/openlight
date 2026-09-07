# Standard sharpening baseline

Implemented 2026-09-07, following the [sharpening proposal](detail-filters.md#proposed-sharpening).

The Details section contains Clarity, Sharpening, and Radius. Light and Color have their own collapsible sections. Sections start open; collapsing them does not alter edits or history.

## Operation

Use ordinary luminance unsharp masking:

```text
L = sRGB_transfer(max(Rec2020_luminance(rgb), 0))
base = Gaussian_sigma(L * alpha) / Gaussian_sigma(alpha)
L_out = max(L + (Sharpening / 100) * (L - base), 0)
```

Convert `L_out` back to linear luminance and scale the input RGB to that luminance. Preserve alpha. The shared shader supplies the same perceptual luminance and color reconstruction as Clarity.

Sharpening ranges from 0 to 150, default 0. Radius ranges from 0.5 to 3 source pixels in 0.1 increments, default 1. Radius means Gaussian standard deviation. Each one-dimensional kernel is sampled on the pixel grid, truncated at `ceil(3 * sigma)`, and normalized. Edges use clamped coordinates. Zero amount bypasses all passes exactly.

This is a baseline for manual comparison, without thresholding, masking, deconvolution, or fitted constants. Radius and amount values need not match another editor's controls. Strong settings can amplify noise and create halos. Output encoding clips values outside its representable range.

## Reuse and rendering

`src/lib/unsharp-mask` owns one WGSL source and all filtering targets. Sharpening uses full resolution and three passes: horizontal blur with luminance conversion, vertical blur, and reconstruction. Clarity uses the same implementation with reduction 16, sigma 64, and amount divided by 200; its extra reduction pass remains unchanged.

The renderer applies tone adjustments, curves, Clarity, sharpening, then crop/rotation. Radius is independent of preview zoom and crop dimensions. The scene owns defaults and valid bounds; the edit command and sidebar use those same bounds. No dependency was added.

## Verification and comparison

The browser detail-filter test compares exported GPU pixels with an independent CPU Gaussian calculation at radii 0.5, 1, 1.7, and 3 and amounts 0, 50, 100, and 150. It covers black and gray steps, flat fields, transparency, and image borders with a tolerance of two 8-bit code values. Mock tests cover bypass, pipeline reuse, and disposal. The main editing session exercises controls, undo/reset, collapsible sections, and combined exports.

For manual comparison, load `public/debug/export.png`, set all other adjustments to zero and curves to identity, and start with Sharpening 100, Radius 1. Compare at 100% zoom. Export without resizing or output sharpening. Then vary only Radius or Amount. This distinguishes edge width from edge amplitude before adding adaptive behavior.

The browser control API uses the same scene edits as the sliders:

```js
window.openlight.setAdjustments({ clarity: 0, sharpening: 100, sharpenRadius: 1 });
const png = await window.openlight.exportImage();
```

For a GPU script, instantiate `createUnsharpMask(gpu, source)` and call `render(frame, input, 1, 1)` for 100% amount and radius 1. Dispose the owner when done. Use `vgpu/node` for actual pixel execution or `vgpu/mock` for lifecycle checks. The existing `bun run test:clarity` comparison script still exercises Clarity through this shared implementation.
