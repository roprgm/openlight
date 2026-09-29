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
import brushShader from "./brush.wgsl";
import copyShader from "./copy.wgsl";
import { type Dab, strokeDabs } from "./dabs";
import gradientShader from "./gradient.wgsl";
import strokeShader from "./strokes.wgsl";

/** Dabs per pass: every fragment in the chunk's bounds loops over them. */
const chunk = 64;
/** Brush rasters grow in tiles of this many source pixels, so a stroke moves its raster only as it reaches a new tile. */
const tile = 256;

type Size = readonly [number, number];
/** A texture covering part of the source: its first texel sits at `origin`, in source pixels, and nothing lies outside it. */
export type Raster = {
  readonly target: Target;
  readonly origin: readonly [number, number];
};
/** A region of the source in whole pixels. */
type Region = { origin: [number, number]; size: [number, number] };
/** One brush's own coverage over the region its strokes paint, stamped as they grow. */
type Brush = {
  target: Target;
  origin: [number, number];
  strokes: readonly BrushStroke[];
  /** Dabs already stamped from the last stroke. */
  dabs: number;
};
/** A mask's own coverage combined with the children that shape it, over the whole source. */
type Group = {
  target: Target;
  ops: readonly MaskModifier[];
};

/** The tiles that the paint strokes can reach within the source, or nothing when none reach it. */
export function paintedRegion(
  strokes: readonly BrushStroke[],
  size: Size,
): Region | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes) {
    if (stroke.mode !== "paint") {
      continue;
    }
    // A pixel past the radius holds the antialiased edge.
    const reach = stroke.size / 2 + 1;
    for (const [x, y] of stroke.points) {
      left = Math.min(left, x - reach);
      top = Math.min(top, y - reach);
      right = Math.max(right, x + reach);
      bottom = Math.max(bottom, y + reach);
    }
  }
  const x = Math.max(0, Math.floor(left / tile) * tile);
  const y = Math.max(0, Math.floor(top / tile) * tile);
  const width = Math.min(size[0], Math.ceil(right / tile) * tile) - x;
  const height = Math.min(size[1], Math.ceil(bottom / tile) * tile) - y;
  if (!(width > 0 && height > 0)) {
    return undefined;
  }
  return { origin: [x, y], size: [width, height] };
}

function sameRegion(brush: Brush, region: Region) {
  return (
    brush.origin[0] === region.origin[0] &&
    brush.origin[1] === region.origin[1] &&
    brush.target.size[0] === region.size[0] &&
    brush.target.size[1] === region.size[1]
  );
}

function contains(outer: Region, brush: Brush) {
  return (
    brush.origin[0] >= outer.origin[0] &&
    brush.origin[1] >= outer.origin[1] &&
    brush.origin[0] + brush.target.size[0] <= outer.origin[0] + outer.size[0] &&
    brush.origin[1] + brush.target.size[1] <= outer.origin[1] + outer.size[1]
  );
}

/** A mask's own coverage followed by the children that shape it, in stored order. */
function maskOps(layer: MaskLayer): readonly MaskModifier[] {
  return [
    { id: layer.id, mask: layer.mask, operation: "add", opacity: 1 },
    ...maskModifiers(layer),
  ];
}

/** Whether an op can cover pixels: a gradient always does, a brush once it paints a stroke. */
function covers(op: MaskModifier) {
  return (
    op.mask.kind !== "brush" ||
    op.mask.strokes.some((stroke) => stroke.mode === "paint")
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
 * coverage of its strokes over the tiles they reach, stamped incrementally as they grow and
 * replayed when earlier content changes; a mask shaped by children combines its own coverage with
 * theirs in a second texture over the whole source, rebuilt whenever any of them changes. Strokes
 * stay the document's truth; textures are caches.
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
  const copy = effect(gpu, copyShader);
  let stamped = 0;

  function clear(target: Target) {
    frame(gpu, (frame) => frame.pass({ target, clear: true }, () => {}));
  }

  function stampDabs(
    brush: Brush,
    dabList: readonly Dab[],
    feather: number,
    mode: BrushStroke["mode"],
  ) {
    const { target, origin } = brush;
    const [width, height] = target.size;
    for (let start = 0; start < dabList.length; start += chunk) {
      const batch = dabList.slice(start, start + chunk);
      let left = width;
      let top = height;
      let right = 0;
      let bottom = 0;
      const data = new Float32Array(batch.length * 4);
      batch.forEach(([x, y, radius, alpha], i) => {
        const local = [x - origin[0], y - origin[1], radius, alpha];
        data.set(local, i * 4);
        left = Math.min(left, local[0] - radius);
        top = Math.min(top, local[1] - radius);
        right = Math.max(right, local[0] + radius);
        bottom = Math.max(bottom, local[1] + radius);
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
    brush: Brush,
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
        brush,
        i === fromStroke ? all.slice(skipDabs) : all,
        stroke.feather,
        stroke.mode,
      );
    });
    return count;
  }

  /** A mask's combined coverage at `size`, created or resized as needed, and marked as in use. */
  function reserveGroup(id: string, size: Size) {
    let group = groups.get(id);
    if (
      group &&
      (group.target.size[0] !== size[0] || group.target.size[1] !== size[1])
    ) {
      group.target.color.dispose();
      group = undefined;
    }
    if (!group) {
      group = {
        target: target(gpu, { size: [...size], format: "r8unorm" }),
        ops: [],
      };
      groups.set(id, group);
    }
    used.add(group);
    return group;
  }

  /** Moves a brush onto `region`, keeping what it has stamped when the region still holds it. */
  function place(brush: Brush, region: Region, keep: boolean) {
    const previous = brush.target;
    brush.target = target(gpu, { size: region.size, format: "r8unorm" });
    const offset = [
      brush.origin[0] - region.origin[0],
      brush.origin[1] - region.origin[1],
    ] as const;
    brush.origin = region.origin;
    if (keep) {
      const [width, height] = previous.size;
      frame(gpu, (frame) =>
        frame.pass(
          { target: brush.target, scissor: [...offset, width, height] },
          copy.set({ previous: previous.color, params: { offset } }),
        ),
      );
    } else {
      clear(brush.target);
    }
    previous.color.dispose();
  }

  /**
   * Brings one brush's coverage up to date: appended points stamp, any other change replays every
   * stroke. The raster follows the strokes' region, moving its content when it grows.
   */
  function updateBrush(
    id: string,
    strokes: readonly BrushStroke[],
    size: Size,
  ): Brush | undefined {
    const region = paintedRegion(strokes, size);
    let brush = brushes.get(id);
    if (!region) {
      brush?.target.color.dispose();
      brushes.delete(id);
      return undefined;
    }
    if (!brush) {
      brush = {
        target: target(gpu, { size: region.size, format: "r8unorm" }),
        origin: region.origin,
        strokes: [],
        dabs: 0,
      };
      brushes.set(id, brush);
    }
    used.add(brush);
    const applied = brush.strokes;
    const extending =
      applied.length > 0 &&
      applied !== strokes &&
      extendsStrokes(applied, strokes);
    if (!sameRegion(brush, region)) {
      const keep =
        (applied === strokes || extending) && contains(region, brush);
      place(brush, region, keep);
      if (!keep) {
        brush.strokes = [];
      }
    }
    if (brush.strokes === strokes) {
      return brush;
    }
    if (brush.strokes.length && extending) {
      brush.dabs = stampStrokes(
        brush,
        strokes,
        brush.strokes.length - 1,
        brush.dabs,
      );
    } else {
      clear(brush.target);
      brush.dabs = stampStrokes(brush, strokes);
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
      params: { opacity: op.opacity, origin: brush.origin },
    });
  }

  /** Combines a mask's own coverage with its children's in stored order, once any of them changed. */
  function updateGroup(id: string, ops: readonly MaskModifier[], size: Size) {
    const group = reserveGroup(id, size);
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

  function whole(group: Group): Raster {
    return { target: group.target, origin: [0, 0] };
  }

  function region(brush: Brush | undefined): Raster | undefined {
    return brush && { target: brush.target, origin: brush.origin };
  }

  return {
    /** Shares the incremental brush cache with effects that own individual strokes; nothing when they paint outside the source. */
    brush(id: string, strokes: readonly BrushStroke[], size: Size) {
      return region(updateBrush(id, strokes, size));
    },
    /** Brings the layer's rasters up to date and returns the coverage its composition samples, if any. */
    update(layer: MaskLayer, size: Size): Raster | undefined {
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
          ? whole(updateGroup(layer.id, ops, size))
          : undefined;
      }
      if (active.length === 0) {
        // Nothing shapes the brush, so its own coverage is the mask's; without strokes the layer is bypassed.
        return covers(own) ? region(brushes.get(own.id)) : undefined;
      }
      if (!covers(own) && !active.some((op) => op.operation === "add")) {
        return undefined;
      }
      return whole(updateGroup(layer.id, ops, size));
    },
    /** A mask's combined coverage, or a brush's own. */
    get(id: string): Raster | undefined {
      const group = groups.get(id);
      return group ? whole(group) : region(brushes.get(id));
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
