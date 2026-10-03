# GPU object removal

`inpaint(source, coverage, region, name)` declares a pure render graph; it requires no React, document store, model weights, workers, or pixel readback. `inpaintField` returns each texel's offset to its donor, in texels, as `rg16float`, zero where nothing replaces the pixel: at most 1 MiB. The editor keeps that field, so `pass.ts` synthesizes once per set of strokes and otherwise only calls `sampleInpaint` and blends the result into the scene. All image processing runs in WGSL; TypeScript only describes lattices, levels, and passes. The working image remains linear Rec.2020, with HDR values and the destination alpha preserved by the final blend. The solver works on `[dx, dy, cost, valid]` in `rgba32float`. `sampleInpaint` returns donor RGB with validity in alpha for the compositor.

The algorithm follows non-local, multiscale texture synthesis with PatchMatch, adapted for parallel GPU execution. It is not a reproduction of every step of the IPOL reference and does not infer hidden semantic content.

1. Crop the accumulated patch with surrounding context: at least 32 source pixels, otherwise the largest painted brush diameter on every side, clipped to the image. Combine ordered paint/erase strokes in the shared GPU coverage raster; subtraction does not enlarge the region. Exclude the remaining painted object conservatively before creating a color pyramid.
2. Work on at most 512 texels along the long side. Precompute logarithmic color once. Keep horizontal and vertical texture energy through the pyramid, so coarse colors do not erase fine texture differences.
3. Initialize from nearby wholly unmasked donors using jump flooding and grow the fill inward at the coarsest level; upsample and preserve the previous level's offsets. A donor's entire 7×7 footprint must be clean.
4. Alternate parallel PatchMatch propagation at jumps 8, 4, 2, 1 and eight shrinking-radius random proposals with weighted overlapping reconstruction. Use six iterations at the coarsest level, four at finer levels. Compare nine samples across each 7×7 footprint plus texture descriptors; increase reconstructed-region confidence as refinement proceeds.
5. Keep each hole texel's offset. Sample donors at whole source texels from the image below for the final image rather than exporting the averaged matching pyramid, so the patch follows later changes to that image without solving again. Different pixels can use different offsets. Apply the existing inward feather, patch opacity, and original alpha in a separate blend.

A stroke added to or erased from a patch extends its field: the new field keeps the earlier one's texels while they still fit 512 along the long side, and at every level pins each texel the earlier field filled to its donor, as long as the texel stays in the hole and the donor stays out of it. Pinned texels count as known context, so the new texels match them, and only the rest are searched. Past that size the lattice coarsens, and the earlier offsets land on the nearest texels.

Known, wholly clean patches skip search. Candidate comparison stops once its nonnegative partial error cannot beat the current score. Each search pass owns its uniforms; vgpu shares shader modules and pipelines, and the graph reuses temporary textures across iterations. Reconstruction passes share an effect because they have no uniforms. Random proposals are deterministic for the same inputs; since the inputs include the image below, a change there would find other donors, which is why the editor keeps the field instead of solving again.

## Limits

Small defects in uniform or recurring texture and locally supported boundaries work best. Large missing regions, perspective, unique structures, and several competing backgrounds are ambiguous. Straight edges can continue when they have good local donors; mortar, rails, text, faces, and other precise structures can break or repeat. The local search cannot recover content that only appears elsewhere in the photo. A coarse matching grid can lose features smaller than its texel spacing; output sampling preserves donor detail but cannot recover correspondence detail lost during matching. If there are no clean donors, the affected pixels remain unchanged.

The user should paint over the entire object, including its halo or shadow. Pixels left outside the stroke are treated as valid context. A larger selection is not necessarily easier: it removes more evidence. Adding distant strokes to one patch expands its bounding region and makes the shared matching grid coarser; separate patches preserve more detail for distant spots.

## Verification and measurement

`tests/inpaint-gpu.ts` creates known flat, gradient, periodic, edge, and brick backgrounds, allowing error measurement against a clean reference. Browser tests check actual removal, HDR/alpha, untouched pixels, proxy rendering, a kept field that follows the exposure below without solving again, extensions that keep what was filled, release, unavailable donors, and the H/paint/export/undo workflow. Scene files round-trip Remove patches with their fields and without offsets. `tests/inpaint-photo.ts` runs decoding, removal, and export on the demo photograph without mounting React.

See [PERFORMANCE.md](../../../../PERFORMANCE.md#object-removal) for standalone and integrated benchmarks, including an unchanged-patch cache workload. Report the actual adapter; software-backend timings do not predict physical-GPU latency.

Algorithm references: [Newson et al., non-local multiscale inpainting](https://www.ipol.im/pub/art/2017/189/), [Barnes et al., PatchMatch](https://pixl.cs.princeton.edu/gfx/pubs/Barnes_2009_PAR/index.php).
