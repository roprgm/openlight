import {
  type BlendOptions,
  type Buffer,
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
import brushShader from "./brush.wgsl";
import { type Dab, strokeDabs } from "./dabs";
import gradientShader from "./gradient.wgsl";
import strokeShader from "./strokes.wgsl";

/** Dabs per pass: every fragment in the chunk's bounds loops over them. */
const chunk = 64;

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
export function maskOps(layer: MaskLayer): readonly MaskModifier[] {
  return [
    { id: layer.id, mask: layer.mask, operation: "add", opacity: 1 },
    ...maskModifiers(layer),
  ];
}

/** Whether an op can cover pixels: a gradient always does, a brush once it has strokes. */
function covers(op: MaskModifier) {
  return op.mask.kind !== "brush" || op.mask.strokes.length > 0;
}

function sameStroke(a: BrushStroke, b: BrushStroke) {
  return (
    a.mode === b.mode &&
    a.size === b.size &&
    a.feather === b.feather &&
    a.flow === b.flow
  );
}

/** Whether `next` only appends points to `previous`, sharing every earlier point. */
function extendsStroke(previous: BrushStroke, next: BrushStroke) {
  return (
    previous === next ||
    (sameStroke(previous, next) &&
      next.points.length >= previous.points.length &&
      previous.points.every((point, i) => point === next.points[i]))
  );
}

/** Whether `after` only appends strokes or points to `before`. */
function extendsStrokes(
  before: readonly BrushStroke[],
  after: readonly BrushStroke[],
) {
  return (
    after.length >= before.length &&
    before.every((stroke, i) =>
      i === before.length - 1
        ? extendsStroke(stroke, after[i])
        : stroke === after[i],
    )
  );
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

const over: BlendOptions = { color: { src: "one", dst: "one-minus-src" } };
const out: BlendOptions = { color: { src: "zero", dst: "one-minus-src" } };
const add: BlendOptions = { color: { src: "one", dst: "one" } };
const subtract: BlendOptions = {
  color: { src: "one", dst: "one", op: "reverse-subtract" },
};

/**
 * Rasterizes brush coverage into r8unorm textures at source resolution. Each brush owns the
 * coverage of its strokes, stamped incrementally as they grow and replayed when earlier content
 * changes; a mask shaped by children combines its own coverage with theirs in a second texture,
 * rebuilt whenever any of them changes. Strokes stay the document's truth; textures are caches.
 */
export function createMaskRaster(gpu: Gpu) {
  const brushes = new Map<string, Brush>();
  const groups = new Map<string, Group>();
  const used = new Set<Brush | Group>();
  const dabs: Buffer = gpu.device.createBuffer({
    size: chunk * 16,
    usage: ["storage", "copy_dst"],
  });
  const paint = effect(gpu, strokeShader, { blend: over, set: { dabs } });
  const erase = effect(gpu, strokeShader, { blend: out, set: { dabs } });
  const gradientAdd = effect(gpu, gradientShader, { blend: add });
  const gradientSubtract = effect(gpu, gradientShader, { blend: subtract });
  const brushAdd = effect(gpu, brushShader, { blend: add });
  const brushSubtract = effect(gpu, brushShader, { blend: subtract });
  let stamped = 0;

  function clear(target: Target) {
    frame(gpu, (frame) => frame.pass({ target, clear: true }, () => {}));
  }

  function stampDabs(
    target: Target,
    dabList: readonly Dab[],
    feather: number,
    mode: BrushStroke["mode"],
  ) {
    const [width, height] = target.size;
    for (let start = 0; start < dabList.length; start += chunk) {
      const batch = dabList.slice(start, start + chunk);
      let left = width;
      let top = height;
      let right = 0;
      let bottom = 0;
      const data = new Float32Array(batch.length * 4);
      batch.forEach((dab, i) => {
        data.set(dab, i * 4);
        left = Math.min(left, dab[0] - dab[2]);
        top = Math.min(top, dab[1] - dab[2]);
        right = Math.max(right, dab[0] + dab[2]);
        bottom = Math.max(bottom, dab[1] + dab[2]);
      });
      const x = Math.max(0, Math.floor(left) - 1);
      const y = Math.max(0, Math.floor(top) - 1);
      const w = Math.min(width, Math.ceil(right) + 1) - x;
      const h = Math.min(height, Math.ceil(bottom) + 1) - y;
      if (w <= 0 || h <= 0) {
        continue;
      }
      dabs.write(data);
      const pass = mode === "paint" ? paint : erase;
      pass.set({ params: { count: batch.length, feather } });
      // One frame per chunk: buffer and uniform writes land in queue order, before the pass that reads them.
      frame(gpu, (frame) =>
        frame.pass({ target, clear: false, scissor: [x, y, w, h] }, pass),
      );
      stamped += batch.length;
    }
  }

  /** Stamps strokes from `fromStroke` on, skipping `skipDabs` of that first one; returns the last stroke's dab count. */
  function stampStrokes(
    target: Target,
    strokes: readonly BrushStroke[],
    fromStroke = 0,
    skipDabs = 0,
  ) {
    let count = 0;
    strokes.forEach((stroke, i) => {
      if (i < fromStroke) {
        return;
      }
      const all = strokeDabs(stroke);
      count = all.length;
      stampDabs(
        target,
        i === fromStroke ? all.slice(skipDabs) : all,
        stroke.feather,
        stroke.mode,
      );
    });
    return count;
  }

  /** The entry for `id` at `size`, created or resized as needed, and marked as in use. */
  function reserve<E extends Brush | Group>(
    map: Map<string, E>,
    id: string,
    size: Size,
    create: (target: Target) => E,
  ) {
    let entry = map.get(id);
    if (
      entry &&
      (entry.target.size[0] !== size[0] || entry.target.size[1] !== size[1])
    ) {
      entry.target.color.dispose();
      entry = undefined;
    }
    if (!entry) {
      entry = create(target(gpu, { size: [...size], format: "r8unorm" }));
      map.set(id, entry);
    }
    used.add(entry);
    return entry;
  }

  /** Brings one brush's coverage up to date: appended points stamp, any other change replays every stroke. */
  function updateBrush(
    id: string,
    strokes: readonly BrushStroke[],
    size: Size,
  ) {
    const brush = reserve(brushes, id, size, (target) => ({
      target,
      strokes: [],
      dabs: 0,
    }));
    const applied = brush.strokes;
    if (applied === strokes) {
      return brush;
    }
    if (applied.length && extendsStrokes(applied, strokes)) {
      brush.dabs = stampStrokes(
        brush.target,
        strokes,
        applied.length - 1,
        brush.dabs,
      );
    } else {
      clear(brush.target);
      brush.dabs = stampStrokes(brush.target, strokes);
    }
    brush.strokes = strokes;
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
      coverage: brush.target.color,
      params: { opacity: op.opacity },
    });
  }

  /** Combines a mask's own coverage with its children's in stored order, once any of them changed. */
  function updateGroup(id: string, ops: readonly MaskModifier[], size: Size) {
    const group = reserve(groups, id, size, (target) => ({ target, ops: [] }));
    if (sameOps(group.ops, ops)) {
      return group;
    }
    clear(group.target);
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

  function release<E extends Brush | Group>(map: Map<string, E>) {
    for (const [id, entry] of map) {
      if (!used.has(entry)) {
        entry.target.color.dispose();
        map.delete(id);
      }
    }
  }

  return {
    /** Shares the incremental brush cache with effects that own individual strokes. */
    brush(id: string, strokes: readonly BrushStroke[], size: Size) {
      return input(updateBrush(id, strokes, size).target);
    },
    /** Brings the layer's rasters up to date and returns the coverage its composition samples, if any. */
    update(layer: MaskLayer, size: Size): RenderInput | undefined {
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
          ? input(updateGroup(layer.id, ops, size).target)
          : undefined;
      }
      if (active.length === 0) {
        // Nothing shapes the brush, so its own coverage is the mask's; without strokes the layer is bypassed.
        const brush = covers(own) ? brushes.get(own.id) : undefined;
        return brush && input(brush.target);
      }
      if (!covers(own) && !active.some((op) => op.operation === "add")) {
        return undefined;
      }
      return input(updateGroup(layer.id, ops, size).target);
    },
    /** A mask's combined coverage, or a brush's own. */
    get(id: string): RenderInput | undefined {
      const raster = groups.get(id) ?? brushes.get(id);
      return raster && input(raster.target);
    },
    /** Releases the rasters that no update used since the previous sweep. */
    sweep() {
      release(brushes);
      release(groups);
      used.clear();
    },
    inspect() {
      return {
        stamped,
        rasters: [
          ...[...brushes].map(([id, { target }]) => ({
            id,
            size: [...target.size],
          })),
          ...[...groups].map(([id, { target }]) => ({
            id: `${id}/group`,
            size: [...target.size],
          })),
        ],
      };
    },
    dispose() {
      for (const { target } of [...brushes.values(), ...groups.values()]) {
        target.color.dispose();
      }
      brushes.clear();
      groups.clear();
      dabs.dispose();
    },
  };
}
