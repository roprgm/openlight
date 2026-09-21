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
import { type Dab, strokeDabs } from "./dabs";
import gradientShader from "./gradient.wgsl";
import strokeShader from "./strokes.wgsl";

/** Dabs per pass: every fragment in the chunk's bounds loops over them. */
const chunk = 64;

type Entry = {
  target: Target;
  ops: readonly MaskModifier[];
  /** Dabs already stamped from the last op's last stroke. */
  dabs: number;
};

/** A mask's own coverage followed by the children that shape it, in stored order. */
export function maskOps(layer: MaskLayer): readonly MaskModifier[] {
  return [
    { mask: layer.mask, operation: "add", opacity: 1 },
    ...maskModifiers(layer),
  ];
}

/** Nothing is painted and nothing adds to it, so the mask covers no pixel. */
function empty(ops: readonly MaskModifier[]) {
  const [base, ...modifiers] = ops;
  return (
    base.mask.kind === "brush" &&
    base.mask.strokes.length === 0 &&
    !modifiers.some(
      (op) =>
        op.operation === "add" &&
        (op.mask.kind !== "brush" || op.mask.strokes.length > 0),
    )
  );
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

/** Whether `next` only appends strokes or points to `previous`. */
function extendsOp(previous: MaskModifier, next: MaskModifier) {
  if (
    previous.mask.kind !== "brush" ||
    next.mask.kind !== "brush" ||
    previous.operation !== next.operation ||
    previous.opacity !== next.opacity
  ) {
    return false;
  }
  const before = previous.mask.strokes;
  const after = next.mask.strokes;
  return (
    after.length >= before.length &&
    before.every((stroke, i) =>
      i === before.length - 1
        ? extendsStroke(stroke, after[i])
        : stroke === after[i],
    )
  );
}

function sameOp(a: MaskModifier, b: MaskModifier) {
  return (
    a.mask === b.mask && a.operation === b.operation && a.opacity === b.opacity
  );
}

const over: BlendOptions = { color: { src: "one", dst: "one-minus-src" } };
const out: BlendOptions = { color: { src: "zero", dst: "one-minus-src" } };
const add: BlendOptions = { color: { src: "one", dst: "one" } };
const subtract: BlendOptions = {
  color: { src: "one", dst: "one", op: "reverse-subtract" },
};

/**
 * Rasterizes mask coverage into one r8unorm texture per layer at source resolution.
 * Strokes are the document's truth; textures are caches stamped incrementally as strokes grow
 * and rebuilt when earlier content changes, so undo and reload replay the same passes.
 */
export function createMaskRaster(gpu: Gpu) {
  const entries = new Map<string, Entry>();
  const dabs: Buffer = gpu.device.createBuffer({
    size: chunk * 16,
    usage: ["storage", "copy_dst"],
  });
  const paint = effect(gpu, strokeShader, { blend: over, set: { dabs } });
  const erase = effect(gpu, strokeShader, { blend: out, set: { dabs } });
  const gradientAdd = effect(gpu, gradientShader, { blend: add });
  const gradientSubtract = effect(gpu, gradientShader, { blend: subtract });
  let stamped = 0;

  function stampDabs(
    entry: Entry,
    dabList: readonly Dab[],
    feather: number,
    mode: BrushStroke["mode"],
  ) {
    const [width, height] = entry.target.size;
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
        frame.pass(
          { target: entry.target, clear: false, scissor: [x, y, w, h] },
          pass,
        ),
      );
      stamped += batch.length;
    }
  }

  /**
   * Applies an op's strokes from `fromStroke`, skipping `skipDabs` of that first stroke, and
   * returns the dab count of its last stroke. A subtracting child erases with its paint strokes;
   * its erase strokes have nothing of their own to remove, so they are skipped.
   */
  function stampStrokes(
    entry: Entry,
    op: MaskModifier,
    fromStroke = 0,
    skipDabs = 0,
  ) {
    if (op.mask.kind !== "brush") {
      return 0;
    }
    let count = 0;
    op.mask.strokes.forEach((stroke, i) => {
      if (i < fromStroke) {
        return;
      }
      const all = strokeDabs(stroke, op.opacity);
      count = all.length;
      if (op.operation === "subtract" && stroke.mode === "erase") {
        return;
      }
      const mode = op.operation === "subtract" ? "erase" : stroke.mode;
      stampDabs(
        entry,
        i === fromStroke ? all.slice(skipDabs) : all,
        stroke.feather,
        mode,
      );
    });
    return count;
  }

  function applyOp(entry: Entry, op: MaskModifier) {
    if (op.mask.kind === "brush") {
      return stampStrokes(entry, op);
    }
    const pass = op.operation === "add" ? gradientAdd : gradientSubtract;
    pass.set({ params: { ...gradientParams(op.mask), opacity: op.opacity } });
    frame(gpu, (frame) =>
      frame.pass({ target: entry.target, clear: false }, pass),
    );
    return 0;
  }

  function rebuild(entry: Entry, ops: readonly MaskModifier[]) {
    frame(gpu, (frame) =>
      frame.pass({ target: entry.target, clear: true }, () => {}),
    );
    let count = 0;
    for (const op of ops) {
      count = applyOp(entry, op);
    }
    return count;
  }

  function release(id: string) {
    const entry = entries.get(id);
    if (entry) {
      entry.target.color.dispose();
      entries.delete(id);
    }
  }

  return {
    /** Brings the layer's raster up to date and returns it as a render input. */
    update(
      layer: MaskLayer,
      size: readonly [number, number],
    ): RenderInput | undefined {
      const ops = maskOps(layer);
      if (!ops.some((op) => op.mask.kind === "brush") || empty(ops)) {
        release(layer.id);
        return undefined;
      }
      let entry = entries.get(layer.id);
      if (
        entry &&
        (entry.target.size[0] !== size[0] || entry.target.size[1] !== size[1])
      ) {
        release(layer.id);
        entry = undefined;
      }
      if (!entry) {
        entry = {
          target: target(gpu, { size: [...size], format: "r8unorm" }),
          ops: [],
          dabs: 0,
        };
        entries.set(layer.id, entry);
      }
      const applied = entry.ops;
      let common = 0;
      while (common < applied.length && sameOp(applied[common], ops[common])) {
        common++;
      }
      if (common === applied.length) {
        for (const op of ops.slice(common)) {
          entry.dabs = applyOp(entry, op);
        }
      } else if (
        common === applied.length - 1 &&
        extendsOp(applied[common], ops[common])
      ) {
        const previous = applied[common].mask;
        const strokes = previous.kind === "brush" ? previous.strokes.length : 0;
        entry.dabs = stampStrokes(
          entry,
          ops[common],
          Math.max(0, strokes - 1),
          entry.dabs,
        );
        for (const op of ops.slice(common + 1)) {
          entry.dabs = applyOp(entry, op);
        }
      } else {
        entry.dabs = rebuild(entry, ops);
      }
      entry.ops = ops;
      return input(entry.target);
    },
    get(id: string): RenderInput | undefined {
      const entry = entries.get(id);
      return entry && input(entry.target);
    },
    /** Keeps only the listed layers' rasters. */
    retain(ids: ReadonlySet<string>) {
      for (const id of [...entries.keys()]) {
        if (!ids.has(id)) {
          release(id);
        }
      }
    },
    release,
    inspect() {
      return {
        stamped,
        rasters: [...entries].map(([id, entry]) => ({
          id,
          size: [...entry.target.size],
        })),
      };
    },
    dispose() {
      for (const entry of entries.values()) {
        entry.target.color.dispose();
      }
      entries.clear();
      dabs.dispose();
    },
  };
}
