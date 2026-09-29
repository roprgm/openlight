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
  type PaintLayer,
  type PaintStroke,
} from "@/core/document";
import { parseColor } from "@/core/image/blend";
import { gradientParams } from "@/core/renderer/blend";
import { input, type RenderInput } from "@/core/renderer/node";
import brushShader from "./brush.wgsl";
import { type Dab, strokeDabs } from "./dabs";
import gradientShader from "./gradient.wgsl";
import strokeShader from "./strokes.wgsl";
import { readRaster, writeRaster } from "./transfer";

/** Dabs per pass: every fragment in the chunk's bounds loops over them. */
const chunk = 64;

type Size = readonly [number, number];
/** Coverage strokes stamp white into one channel; paint strokes stamp their color with coverage as alpha. */
type Stroke = BrushStroke | PaintStroke;
/** One brush's own coverage or paint, stamped as its strokes grow. */
type Brush = {
  target: Target;
  strokes: readonly Stroke[];
  /** Dabs already stamped from the last stroke. */
  dabs: number;
  /** A paint raster's settled pixels, which its strokes draw over. */
  base?: string;
};
const none: readonly Stroke[] = [];
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

function strokeColor(stroke: Stroke) {
  return "color" in stroke ? stroke.color : undefined;
}

function sameStroke(a: Stroke, b: Stroke) {
  return (
    a.mode === b.mode &&
    a.size === b.size &&
    a.feather === b.feather &&
    a.flow === b.flow &&
    strokeColor(a) === strokeColor(b)
  );
}

/** Whether `next` only appends points to `previous`, sharing every earlier point. */
function extendsStroke(previous: Stroke, next: Stroke) {
  return (
    previous === next ||
    (sameStroke(previous, next) &&
      next.points.length >= previous.points.length &&
      previous.points.every((point, i) => point === next.points[i]))
  );
}

/** Whether `after` only appends strokes or points to `before`. */
function extendsStrokes(before: readonly Stroke[], after: readonly Stroke[]) {
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

// Premultiplied: paint lays its share over what is there; erase removes that share of it.
const over: BlendOptions = {
  color: { src: "one", dst: "one-minus-src-alpha" },
  alpha: { src: "one", dst: "one-minus-src-alpha" },
};
const out: BlendOptions = {
  color: { src: "zero", dst: "one-minus-src-alpha" },
  alpha: { src: "zero", dst: "one-minus-src-alpha" },
};
const white = [1, 1, 1] as const;
const add: BlendOptions = { color: { src: "one", dst: "one" } };
const subtract: BlendOptions = {
  color: { src: "one", dst: "one", op: "reverse-subtract" },
};

/**
 * Rasterizes brush coverage into r8unorm textures, and paint into premultiplied rgba8unorm ones, at
 * source resolution. Each brush owns the coverage of its strokes, stamped incrementally as they grow
 * and replayed when earlier content changes; a mask shaped by children combines its own coverage
 * with theirs in a second texture, rebuilt whenever any of them changes. Strokes stay the document's
 * truth; textures are caches.
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

  function stampDabs(target: Target, dabList: readonly Dab[], stroke: Stroke) {
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
      const pass = stroke.mode === "paint" ? paint : erase;
      const color = strokeColor(stroke);
      pass.set({
        params: {
          count: batch.length,
          feather: stroke.feather,
          color: color ? parseColor(color) : white,
        },
      });
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
    strokes: readonly Stroke[],
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
      stampDabs(target, i === fromStroke ? all.slice(skipDabs) : all, stroke);
    });
    return count;
  }

  /** The entry for `id` at `size`, created or resized as needed, and marked as in use. */
  function reserve<E extends Brush | Group>(
    map: Map<string, E>,
    id: string,
    size: Size,
    create: (target: Target) => E,
    format: GPUTextureFormat = "r8unorm",
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
      // Transparent, so a paint raster starts empty; coverage reads only red.
      entry = create(
        target(gpu, { size: [...size], format, clearColor: [0, 0, 0, 0] }),
      );
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

  function reservePaint(id: string, size: Size) {
    return reserve(
      brushes,
      id,
      size,
      (target) => ({ target, strokes: none, dabs: 0 }),
      "rgba8unorm",
    );
  }

  /** Whether a paint raster holds `base` and strokes that only grow into `strokes`. */
  function holds(
    brush: Brush | undefined,
    base: string | undefined,
    strokes: readonly Stroke[],
  ): brush is Brush {
    return (
      brush !== undefined &&
      brush.base === base &&
      (brush.strokes === strokes || extendsStrokes(brush.strokes, strokes))
    );
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
    /** Whether a paint layer's raster must load its settled pixels before it can draw the layer's strokes. */
    needsBase(layer: PaintLayer): layer is PaintLayer & { raster: string } {
      return (
        layer.raster !== undefined &&
        !holds(brushes.get(layer.id), layer.raster, layer.strokes)
      );
    },
    /** Loads a paint layer's settled pixels; the next update draws its strokes over them. */
    async loadBase(id: string, base: string, pixels: Blob, size: Size) {
      const brush = reservePaint(id, size);
      await writeRaster(gpu, brush.target, pixels);
      Object.assign(brush, { base, strokes: none, dabs: 0 });
    },
    /**
     * Brings a paint layer's raster up to date: its settled pixels, loaded first, and its strokes over
     * them. The raster comes with the layer's first paint and stays, cleared if need be, while the layer
     * lasts, so painting and undoing never reallocate it.
     */
    paint({ id, raster: base, strokes }: PaintLayer, size: Size) {
      if (base === undefined && !strokes.length && !brushes.has(id)) {
        return undefined;
      }
      const brush = reservePaint(id, size);
      if (!holds(brush, base, strokes)) {
        if (base !== undefined) {
          throw Error("Load the paint's settled pixels first.");
        }
        clear(brush.target);
        Object.assign(brush, { base, strokes: none, dabs: 0 });
      }
      if (brush.strokes !== strokes) {
        brush.dabs = stampStrokes(
          brush.target,
          strokes,
          Math.max(brush.strokes.length - 1, 0),
          brush.strokes.length ? brush.dabs : 0,
        );
        brush.strokes = strokes;
      }
      return base !== undefined || strokes.length
        ? input(brush.target)
        : undefined;
    },
    /**
     * Reads a paint layer's raster, its settled pixels with every stroke drawn, so they settle into new
     * pixels; `commit` records that the raster now holds them alone. Nothing may draw meanwhile.
     */
    async settle(id: string) {
      const brush = brushes.get(id);
      if (!brush) {
        return undefined;
      }
      const { base, strokes } = brush;
      const pixels = await readRaster(gpu, brush.target);
      return {
        base,
        strokes,
        pixels,
        commit(base: string) {
          Object.assign(brush, { base, strokes: none, dabs: 0 });
        },
      };
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
            format: target.format,
          })),
          ...[...groups].map(([id, { target }]) => ({
            id: `${id}/group`,
            size: [...target.size],
            format: target.format,
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
