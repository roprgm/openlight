import {
  type BlendOptions,
  type Buffer,
  effect,
  frame,
  type Gpu,
  type Target,
  target,
} from "vgpu";
import type { BrushStroke, PaintStroke } from "@/core/document";
import { parseColor } from "@/core/image/blend";
import type { Point } from "@/core/image/frame";
import copyShader from "./copy.wgsl";
import { type Dab, strokeDabs } from "./dabs";
import emptyShader from "./empty.wgsl";
import layShader from "./lay.wgsl";
import stampShader from "./stamp.wgsl";

/** Dabs per pass: every fragment in the chunk's bounds loops over them. */
const chunk = 32;

type Size = readonly [number, number];
/** x, y, width, height, in pixels. */
export type Rect = readonly [number, number, number, number];
/** Every stroke stamps coverage; a paint stroke also has the color it lays. */
export type Stroke = BrushStroke | PaintStroke;

const white = [1, 1, 1] as const;

function union(a: Rect | undefined, b: Rect | undefined): Rect | undefined {
  if (!a || !b) {
    return a ?? b;
  }
  const left = Math.min(a[0], b[0]);
  const top = Math.min(a[1], b[1]);
  return [
    left,
    top,
    Math.max(a[0] + a[2], b[0] + b[2]) - left,
    Math.max(a[1] + a[3], b[1] + b[3]) - top,
  ];
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
export function extendsStroke(previous: Stroke, next: Stroke) {
  return (
    previous === next ||
    (sameStroke(previous, next) &&
      next.points.length >= previous.points.length &&
      previous.points.every((point, i) => point === next.points[i]))
  );
}

/** Whether `after` only appends strokes or points to `before`. */
export function extendsStrokes(
  before: readonly Stroke[],
  after: readonly Stroke[],
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

// Premultiplied: paint lays its share over what is there; erase removes that share of it.
const over: BlendOptions = {
  color: { src: "one", dst: "one-minus-src-alpha" },
  alpha: { src: "one", dst: "one-minus-src-alpha" },
};
const out: BlendOptions = {
  color: { src: "zero", dst: "one-minus-src-alpha" },
  alpha: { src: "zero", dst: "one-minus-src-alpha" },
};

export type Strokes = ReturnType<typeof createStrokes>;

/**
 * Stamps strokes into the rasters that cache them. A mask's or paint layer's stroke builds up in the
 * stroke buffer, half floats the size of the photo, one stroke at a time: its raster takes it in one
 * pass once another stroke starts, so a stroke drawn a few dabs at a time rounds to 8 bits once, as it
 * does drawn whole. Until then, whoever shows the raster lays the open stroke over it.
 */
export function createStrokes(gpu: Gpu) {
  const dabs: Buffer = gpu.device.createBuffer({
    size: chunk * 16,
    usage: ["storage", "copy_dst"],
  });
  const cover = effect(gpu, stampShader, { blend: over, set: { dabs } });
  const uncover = effect(gpu, stampShader, { blend: out, set: { dabs } });
  const layOver = effect(gpu, layShader, { blend: over });
  const layOut = effect(gpu, layShader, { blend: out });
  const empty = effect(gpu, emptyShader);
  const copy = effect(gpu, copyShader);
  let buffer: Target | undefined;
  /** The last stroke drawn through the buffer, stroke `index` of `raster`, and where its dabs reached. */
  let open:
    | { raster: Target; index: number; stroke: Stroke; bounds?: Rect }
    | undefined;
  let reserved = false;
  let stamped = 0;

  /** Stamps dabs' coverage into `target`, which sits at `origin` in the photo, a chunk at a time. */
  function stampDabs(
    target: Target,
    list: readonly Dab[],
    feather: number,
    pass: typeof cover,
    origin: Point = [0, 0],
  ) {
    const [width, height] = target.size;
    let reached: Rect | undefined;
    for (let start = 0; start < list.length; start += chunk) {
      const batch = list.slice(start, start + chunk);
      let left = width;
      let top = height;
      let right = 0;
      let bottom = 0;
      const data = new Float32Array(batch.length * 4);
      batch.forEach(([x, y, radius, alpha], i) => {
        const center = [x - origin[0], y - origin[1]];
        data.set([center[0], center[1], radius, alpha], i * 4);
        left = Math.min(left, center[0] - radius);
        top = Math.min(top, center[1] - radius);
        right = Math.max(right, center[0] + radius);
        bottom = Math.max(bottom, center[1] + radius);
      });
      const x = Math.max(0, Math.floor(left) - 1);
      const y = Math.max(0, Math.floor(top) - 1);
      const w = Math.min(width, Math.ceil(right) + 1) - x;
      const h = Math.min(height, Math.ceil(bottom) + 1) - y;
      if (w <= 0 || h <= 0) {
        continue;
      }
      dabs.write(data);
      pass.set({ params: { count: batch.length, feather } });
      // One frame per chunk: buffer and uniform writes land in queue order, before the pass that reads them.
      frame(gpu, (frame) =>
        frame.pass({ target, clear: false, scissor: [x, y, w, h] }, pass),
      );
      stamped += batch.length;
      reached = union(reached, [x, y, w, h]);
    }
    return reached;
  }

  function reserveBuffer(size: Size) {
    reserved = true;
    if (buffer && (buffer.size[0] !== size[0] || buffer.size[1] !== size[1])) {
      buffer.color.dispose();
      buffer = undefined;
      open = undefined;
    }
    buffer ??= target(gpu, {
      size: [...size],
      format: "r16float",
      clearColor: [0, 0, 0, 0],
    });
    return buffer;
  }

  /** Lays the open stroke's coverage over `target` within `rect`, in its color or erasing. */
  function lay(target: Target, rect: Rect) {
    if (!open || !buffer) {
      return;
    }
    const { stroke } = open;
    const pass = (stroke.mode === "paint" ? layOver : layOut).set({
      coverage: buffer.color,
      params: { color: "color" in stroke ? parseColor(stroke.color) : white },
    });
    frame(gpu, (frame) =>
      frame.pass({ target, clear: false, scissor: rect }, pass),
    );
  }

  /** Forgets the open stroke, emptying the buffer where it reached; clearing it all would write the whole photo. */
  function forget() {
    const bounds = open?.bounds;
    const emptied = buffer;
    open = undefined;
    if (bounds && emptied) {
      frame(gpu, (frame) =>
        frame.pass({ target: emptied, clear: false, scissor: bounds }, empty),
      );
    }
  }

  function close() {
    if (open?.bounds) {
      lay(open.raster, open.bounds);
    }
    forget();
  }

  return {
    /** The stroke buffer, which a render that shows an open stroke reserves at the photo's size. */
    reserve: reserveBuffer,
    buffer: () => buffer,
    clear(target: Target) {
      frame(gpu, (frame) => frame.pass({ target, clear: true }, () => {}));
    },
    /**
     * Draws `raster`'s strokes from `from` on, skipping `skip` dabs of that first one, through the
     * buffer. The last stays open, so it can grow. Returns its dab count, whether it opened now, and
     * where the buffer changed.
     */
    draw(
      raster: Target,
      strokes: readonly Stroke[],
      from: number,
      skip: number,
    ) {
      const target = reserveBuffer(raster.size);
      let count = 0;
      let opened = false;
      let changed: Rect | undefined;
      for (let i = from; i < strokes.length; i++) {
        const stroke = strokes[i];
        if (open?.raster !== raster || open.index !== i) {
          close();
          opened = true;
        }
        const current = open ?? { raster, index: i, stroke };
        const all = strokeDabs(stroke);
        count = all.length;
        const reached = stampDabs(
          target,
          i === from ? all.slice(skip) : all,
          stroke.feather,
          cover,
        );
        changed = union(changed, reached);
        open = { ...current, stroke, bounds: union(current.bounds, reached) };
      }
      return { dabs: count, opened, changed };
    },
    /**
     * Stamps a stroke, from dab `skip` on, straight into `raster`, which sits at `origin` in the photo;
     * returns its dab count. For hard strokes at full flow, which round the same either way.
     */
    stamp(raster: Target, stroke: Stroke, skip: number, origin: Point) {
      const all = strokeDabs(stroke);
      const pass = stroke.mode === "paint" ? cover : uncover;
      stampDabs(raster, all.slice(skip), stroke.feather, pass, origin);
      return all.length;
    },
    /** Whether `raster`'s last stroke is open, its coverage in the buffer rather than the raster. */
    isOpen: (raster: Target) => open?.raster === raster,
    /** Lays the open stroke into its raster and empties the buffer. */
    close,
    /** Drops `raster`'s open stroke, for a raster about to be drawn again or freed. */
    discard(raster: Target) {
      if (open?.raster === raster) {
        forget();
      }
    },
    /** Copies `raster` into `view` within `rect`, then lays the raster's open stroke over the copy there. */
    resolve(view: Target, raster: Target, rect: Rect) {
      const pass = copy.set({
        source: raster.color,
        params: { offset: [0, 0] },
      });
      frame(gpu, (frame) =>
        frame.pass({ target: view, clear: false, scissor: rect }, pass),
      );
      if (open?.raster === raster) {
        lay(view, rect);
      }
    },
    /** Frees the buffer once no render reserved it since the last sweep and no stroke waits in it. */
    sweep() {
      if (!reserved && !open) {
        buffer?.color.dispose();
        buffer = undefined;
      }
      reserved = false;
    },
    stamped: () => stamped,
    inspect() {
      return buffer
        ? [
            {
              id: "stroke buffer",
              size: [...buffer.size],
              format: buffer.format,
            },
          ]
        : [];
    },
    dispose() {
      buffer?.color.dispose();
      buffer = undefined;
      open = undefined;
      dabs.dispose();
    },
  };
}
