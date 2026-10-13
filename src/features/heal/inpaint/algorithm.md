# GPU object removal

`inpaintField` declares a pure render graph: no React, document store, model weights, workers, or pixel readback. It returns a field of each hole texel's offset to its donor. The editor keeps that field, so a patch synthesizes once per set of strokes, and composition samples donor color from the current image below: the patch follows later edits under it without solving again.

The algorithm adapts non-local, multiscale texture synthesis with PatchMatch to parallel GPU execution; it does not infer hidden semantic content.

1. Crop the patch with surrounding context and exclude the painted object.
2. Match on a pyramid of at most 512 texels along the long side, keeping texture energy so coarse colors do not erase fine texture differences.
3. Initialize from the nearest wholly clean donors and grow the fill inward from the coarsest level.
4. Alternate parallel propagation and random search with overlapping reconstruction.
5. Sample donors at full source resolution.

## Limits

Small defects in uniform or recurring texture work best. Large regions, unique structures, text, faces, and competing backgrounds are ambiguous, and the local search cannot recover content that only appears elsewhere. Pixels outside the stroke count as valid context, so paint over the whole object, including its halo or shadow. Distant strokes in one patch coarsen the matching grid; separate patches keep more detail.

References: [Newson et al., non-local multiscale inpainting](https://www.ipol.im/pub/art/2017/189/), [Barnes et al., PatchMatch](https://pixl.cs.princeton.edu/gfx/pubs/Barnes_2009_PAR/index.php).
