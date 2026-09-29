import {
  type BlendOptions,
  effect,
  frame,
  type Gpu,
  type Target,
  target,
} from "vgpu";
import {
  type BrushStroke,
  type MaskLayer,
  type MaskModifier,
  maskModifiers,
} from "@/core/document";
import { gradientParams } from "@/core/renderer/blend";
import { input, type RenderInput } from "@/core/renderer/node";
import { createRasterCache } from "@/core/renderer/raster-cache";
import {
  extendsStrokes,
  type Rect,
  type Strokes,
} from "@/core/renderer/strokes";
import brushShader from "./brush.wgsl";
import gradientShader from "./gradient.wgsl";

type Size = readonly [number, number];
/** One brush's own coverage, stamped as its strokes grow. */
type Brush = {
  target: Target;
  strokes: readonly BrushStroke[];
  /** Dabs already stamped from the last stroke. */
  dabs: number;
};
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

/** Whether an op can cover pixels: a gradient always does, a brush once it has strokes. */
function covers(op: MaskModifier) {
  return op.mask.kind !== "brush" || op.mask.strokes.length > 0;
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
 * Rasterizes brush coverage into r8unorm textures at source resolution. Each brush owns the coverage
 * of its strokes, drawn through the stroke buffer as they grow and again when earlier content changes;
 * a mask shaped by children combines its own coverage with theirs in a second texture, rebuilt
 * whenever any of them changes. Strokes stay the document's truth; textures are caches.
 */
export function createMaskRaster(gpu: Gpu, strokes: Strokes) {
  const brushes = createRasterCache<Brush>(
    gpu,
    "r8unorm",
    (target) => ({ target, strokes: [], dabs: 0 }),
    (brush) => strokes.discard(brush.target),
  );
  const groups = createRasterCache<Group>(gpu, "r8unorm", (target) => ({
    target,
    ops: [],
  }));
  /** The brush with an open stroke as its readers see it: its raster with the stroke laid over. */
  let view: Target | undefined;
  /** Each mask layer's coverage as its last update left it: its brush's, its group's, or none. */
  const shown = new Map<string, Brush | Group | undefined>();
  const updated = new Set<string>();
  const gradientAdd = effect(gpu, gradientShader, { blend: add });
  const gradientSubtract = effect(gpu, gradientShader, { blend: subtract });
  const brushAdd = effect(gpu, brushShader, { blend: add });
  const brushSubtract = effect(gpu, brushShader, { blend: subtract });

  function coverageOf(brush: Brush) {
    return view && strokes.isOpen(brush.target) ? view : brush.target;
  }

  /** Redraws the view of a brush's open stroke where the stroke changed, or all of it once the stroke opened. */
  function show(brush: Brush, changed: Rect | undefined) {
    const [width, height] = brush.target.size;
    if (view && (view.size[0] !== width || view.size[1] !== height)) {
      view.color.dispose();
      view = undefined;
    }
    view ??= target(gpu, {
      size: [width, height],
      format: "r8unorm",
      clearColor: [0, 0, 0, 0],
    });
    strokes.resolve(view, brush.target, changed ?? [0, 0, width, height]);
  }

  /** Brings one brush's coverage up to date: appended points stamp, any other change draws every stroke again. */
  function updateBrush(id: string, list: readonly BrushStroke[], size: Size) {
    const brush = brushes.reserve(id, size);
    const applied = brush.strokes;
    if (applied === list) {
      return brush;
    }
    const grows = applied.length > 0 && extendsStrokes(applied, list);
    if (!grows) {
      strokes.discard(brush.target);
      strokes.clear(brush.target);
    }
    const drawn = strokes.draw(
      brush.target,
      list,
      grows ? applied.length - 1 : 0,
      grows ? brush.dabs : 0,
    );
    brush.dabs = drawn.dabs;
    brush.strokes = list;
    if (strokes.isOpen(brush.target) && (drawn.opened || drawn.changed)) {
      show(brush, drawn.opened ? undefined : drawn.changed);
    }
    return brush;
  }

  /** The pass that adds or subtracts one op's coverage, or nothing for a brush without strokes. */
  function opPass(op: MaskModifier) {
    if (op.mask.kind !== "brush") {
      const pass = op.operation === "add" ? gradientAdd : gradientSubtract;
      return pass.set({
        params: { ...gradientParams(op.mask), opacity: op.opacity },
      });
    }
    const brush = covers(op) ? brushes.get(op.id) : undefined;
    if (!brush) {
      return undefined;
    }
    const pass = op.operation === "add" ? brushAdd : brushSubtract;
    return pass.set({
      coverage: coverageOf(brush).color,
      params: { opacity: op.opacity },
    });
  }

  /** Combines a mask's own coverage with its children's in stored order, once any of them changed. */
  function updateGroup(id: string, ops: readonly MaskModifier[], size: Size) {
    const group = groups.reserve(id, size);
    if (sameOps(group.ops, ops)) {
      return group;
    }
    strokes.clear(group.target);
    for (const op of ops) {
      const pass = opPass(op);
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
        updateBrush(op.id, op.mask.strokes, size);
      }
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
      return input("ops" in raster ? raster.target : coverageOf(raster));
    },
    /** Releases the rasters that no update used since the previous sweep, and the view with the last brush. */
    sweep() {
      for (const id of shown.keys()) {
        if (!updated.has(id)) {
          shown.delete(id);
        }
      }
      updated.clear();
      brushes.sweep();
      groups.sweep();
      if (!brushes.size) {
        view?.color.dispose();
        view = undefined;
      }
    },
    inspect() {
      return [
        ...brushes.inspect(),
        ...groups.inspect("/group"),
        ...(view
          ? [{ id: "stroke view", size: [...view.size], format: view.format }]
          : []),
      ];
    },
    dispose() {
      brushes.dispose();
      groups.dispose();
      view?.color.dispose();
      view = undefined;
      shown.clear();
    },
  };
}
