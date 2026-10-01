import { type BlendOptions, effect, frame, type Gpu, type Target } from "vgpu";
import {
  hasPaint,
  type MaskLayer,
  type MaskModifier,
  maskModifiers,
} from "@/core/document";
import { gradientParams } from "@/core/renderer/blend";
import { input, type RenderInput } from "@/core/renderer/node";
import { type PaintRaster, paintingSize } from "@/core/renderer/paint";
import { createRasterCache } from "@/core/renderer/raster-cache";
import brushShader from "./brush.wgsl";
import gradientShader from "./gradient.wgsl";
import { hasRangeMask } from "./range";

type Size = readonly [number, number];
/** A mask's own coverage combined with the children that shape it. */
type Group = {
  target: Target;
  ops: readonly MaskModifier[];
};

/** A mask's own coverage followed by the children that shape it, in stored order. */
function maskOps(layer: MaskLayer): readonly MaskModifier[] {
  return [
    { id: layer.id, mask: layer.mask, operation: "add", opacity: 1 },
    ...maskModifiers(layer),
  ];
}

/** Whether an op can cover pixels: a gradient always does, a brush once it has paint. */
function covers(op: MaskModifier) {
  return op.mask.kind !== "brush" || hasPaint(op.mask);
}

function sameOps(a: readonly MaskModifier[], b: readonly MaskModifier[]) {
  return (
    a.length === b.length &&
    a.every(
      (op, i) =>
        op.mask === b[i].mask &&
        op.operation === b[i].operation &&
        op.opacity === b[i].opacity,
    )
  );
}

const add: BlendOptions = { color: { src: "one", dst: "one" } };
const subtract: BlendOptions = {
  color: { src: "one", dst: "one", op: "reverse-subtract" },
};

/**
 * Brings masks' coverage together at half the photo's resolution, as paintings keep theirs. A brush paints its coverage as a paint layer
 * paints color, into an r8unorm raster of `brushes`; a mask shaped by children combines its own
 * coverage with theirs in a second texture, rebuilt whenever any of them changes. Gradients alone
 * need no texture: the mix pass computes them.
 */
export function createMaskRaster(gpu: Gpu, brushes: PaintRaster) {
  const groups = createRasterCache<Group>(gpu, "r8unorm", (target) => ({
    target,
    ops: [],
  }));
  /** Each mask layer's coverage as its last update left it: its brush's, its group's, or none. */
  const shown = new Map<string, Target | Group | undefined>();
  const updated = new Set<string>();
  const gradientAdd = effect(gpu, gradientShader, { blend: add });
  const gradientSubtract = effect(gpu, gradientShader, { blend: subtract });
  const brushAdd = effect(gpu, brushShader, { blend: add });
  const brushSubtract = effect(gpu, brushShader, { blend: subtract });

  /** The pass that adds or subtracts one op's coverage, or nothing for a brush without strokes. */
  function opPass(op: MaskModifier, scale: Size) {
    if (op.mask.kind === "linear" || op.mask.kind === "radial") {
      const pass = op.operation === "add" ? gradientAdd : gradientSubtract;
      return pass.set({
        params: { ...gradientParams(op.mask), opacity: op.opacity, scale },
      });
    }
    const brush = covers(op) ? brushes.coverage(op.id) : undefined;
    if (!brush) {
      return undefined;
    }
    const pass = op.operation === "add" ? brushAdd : brushSubtract;
    return pass.set({
      coverage: brush.target.color,
      params: { opacity: op.opacity },
    });
  }

  /** Combines a mask's own coverage with its children's in stored order, once any of them changed. */
  function updateGroup(id: string, ops: readonly MaskModifier[], source: Size) {
    const size = paintingSize(source);
    const group = groups.reserve(id, size);
    // Gradients evaluate at photo pixels, and the group keeps the brushes' resolution.
    const scale = [source[0] / size[0], source[1] / size[1]] as const;
    if (sameOps(group.ops, ops)) {
      return group;
    }
    frame(gpu, (frame) =>
      frame.pass({ target: group.target, clear: true }, () => {}),
    );
    for (const op of ops) {
      const pass = opPass(op, scale);
      if (pass) {
        // One frame per pass: uniform writes land in queue order, before the pass that reads them.
        frame(gpu, (frame) =>
          frame.pass({ target: group.target, clear: false }, pass),
        );
      }
    }
    group.ops = ops;
    return group;
  }

  /** Brings a mask layer's rasters up to date and returns the one that holds its coverage, if any. */
  function updateLayer(layer: MaskLayer, size: Size) {
    const [own, ...children] = maskOps(layer);
    const active = children.filter(covers);
    const ops = [own, ...active];
    for (const op of ops) {
      if (op.mask.kind === "brush" && covers(op)) {
        brushes.draw(op.id, op.mask, size);
      }
    }
    if (hasRangeMask(layer)) {
      return undefined;
    }
    if (own.mask.kind !== "brush") {
      // Gradient children combine in the mix pass; a painted brush child needs a raster.
      return active.some((op) => op.mask.kind === "brush")
        ? updateGroup(layer.id, ops, size)
        : undefined;
    }
    if (active.length === 0) {
      // Nothing shapes the brush, so its own coverage is the mask's; without strokes the layer is bypassed.
      return covers(own) ? brushes.get(own.id) : undefined;
    }
    if (!covers(own) && !active.some((op) => op.operation === "add")) {
      return undefined;
    }
    return updateGroup(layer.id, ops, size);
  }

  return {
    /** Brings a mask layer's rasters up to date; `coverage` reads them once every layer has. */
    update(layer: MaskLayer, size: Size) {
      shown.set(layer.id, updateLayer(layer, size));
      updated.add(layer.id);
    },
    /**
     * A mask layer's coverage, or a brush's own, if any. Read it once every layer updated: drawing one
     * brush can close another's stroke.
     */
    coverage(id: string): RenderInput | undefined {
      const raster = shown.has(id) ? shown.get(id) : brushes.get(id);
      if (!raster) {
        return undefined;
      }
      return "ops" in raster ? input(raster.target) : brushes.coverage(id);
    },
    brushCoverage: brushes.coverage,
    /** Releases the rasters that no update used since the previous sweep, including their painting views. */
    sweep() {
      for (const id of shown.keys()) {
        if (!updated.has(id)) {
          shown.delete(id);
        }
      }
      updated.clear();
      brushes.sweep();
      groups.sweep();
    },
    inspect: () => [...brushes.inspect(), ...groups.inspect("/group")],
    dispose() {
      brushes.dispose();
      groups.dispose();
      shown.clear();
    },
  };
}
