# Magic Wand

The feature owns its commands, UI, GPU engine, and tests. `getSelection` associates a session with its document and registers cleanup with `document.resources.own`. Nothing enters `Scene` or history. The application only composes the button, mode, image overlay, and browser commands.

On entry and renderer updates, one compute pass samples `renderer.outputImage()` in linear Rec.2020 at a maximum long edge of 1536 pixels. It writes OKLab plus 5×5 luminance variance to `rgba16float` and the soft luminance gradient to a separate `r32float` texture (five values need five channels). The OKLab conversion preserves floating point range; it never reads an 8-bit canvas.

Four-neighbor path cost is accumulated OKLab distance + `EDGE_WEIGHT * max(edge_i, edge_j)` + `TEXTURE_WEIGHT * abs(variance_i - variance_j)`. Tune both weights and `DEFAULT_TOLERANCE` in `cost.ts`. The CPU and GPU share these weights, the quantized affinity field, and the averaged seed. Broad smooth gradients remain cheaper than contrasting or textured boundaries; there is no edge detection followed by a fill and no ML or model dependency.

Preview relaxes distances on the GPU for 16 iterations per animation frame. Raising tolerance continues the frontier; lowering tolerance or changing seed sampling restarts it. Preview is deliberately approximate and may lag large regions. Pointer release runs exact Dijkstra on the same field, yielding every 8192 visited pixels so Escape and replacement can cancel it. Noncontiguous mode uses only OKLab distance from the seed average.

Both paths share bilinear upsampling, Gaussian feathering limited to border neighborhoods, and soft mask composition. Full-size masks use `r8unorm` coverage. Replace, max/add, multiply/subtract, and min/intersect operate against the previous committed mask; cancellation preserves it. Frame/source changes clear it; adjustments preserve it. Feather and sampling options affect the active drag or next seed. Masks remain visible after Apply but do not affect adjustments or export.

`compute.ts` uses native compute pipelines through the vgpu device because vgpu 0.3 rejects storage-texture bindings in `compute.set`. Pipelines, ping-pong bindings, and uniform buffers are reused. Textures, effects, surface mounting, and other rendering use vgpu directly.

Verification: `bun run test` covers gradient/boundary costs, detours, noncontiguous selection, and document cleanup. `bun run test:gpu` also compares actual GPU preview and exact masks, soft border values, modifiers, and cancellation on a linear fixture. The existing Playwright editing session includes one flat-patch selection step.
