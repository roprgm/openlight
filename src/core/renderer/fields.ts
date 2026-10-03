import type { Gpu, Target } from "vgpu";
import type { BrushStroke, RemoveField } from "@/core/document";
import { input, type RenderInput } from "./node";
import { createRasterCache } from "./raster-cache";
import { copyRaster, readRaster, writeRaster } from "./transfer";

/** Where a field's texels sit in the photo. */
export type FieldLattice = Pick<RemoveField, "origin" | "scale" | "size">;

/** A Remove field a renderer holds and the strokes it was synthesized for. */
export type HeldField = {
  texels: RenderInput;
  lattice: FieldLattice;
  strokes: readonly BrushStroke[];
};

type Entry = {
  target: Target;
  lattice: FieldLattice;
  strokes: readonly BrushStroke[];
};

/** Whether `strokes` start with every stroke of `first`, the same objects. */
function startsWith(
  strokes: readonly BrushStroke[],
  first: readonly BrushStroke[],
) {
  return (
    first.length <= strokes.length &&
    first.every((stroke, i) => stroke === strokes[i])
  );
}

/**
 * Holds one Remove field per patch, synthesized by a render or loaded from the document, with the
 * strokes it was synthesized for. A field for the patch's first strokes is the base that later
 * strokes extend.
 */
export function createFieldStore(gpu: Gpu) {
  const fields = createRasterCache<Entry>(gpu, "rg16float", (target) => ({
    target,
    lattice: { origin: [0, 0], scale: 1, size: target.size },
    strokes: [],
  }));
  function usable(
    key: string,
    strokes: readonly BrushStroke[],
    saved?: RemoveField,
  ) {
    const entry = fields.get(key);
    if (!entry?.strokes.length || !startsWith(strokes, entry.strokes)) {
      return undefined;
    }
    // A saved field for every stroke is what the patch shows, not an extension of fewer.
    if (
      saved?.strokes === strokes.length &&
      entry.strokes.length < strokes.length
    ) {
      return undefined;
    }
    return entry;
  }
  return {
    /** Whether a patch's saved field must load first, since nothing held serves its strokes. */
    needs(
      key: string,
      strokes: readonly BrushStroke[],
      saved?: RemoveField,
    ): saved is RemoveField {
      return saved !== undefined && !usable(key, strokes, saved);
    },
    async load(
      key: string,
      strokes: readonly BrushStroke[],
      saved: RemoveField,
      texels: Blob,
    ) {
      const entry = fields.reserve(key, saved.size);
      entry.strokes = [];
      await writeRaster(gpu, entry.target, texels);
      const { origin, scale, size } = saved;
      entry.lattice = { origin, scale, size };
      entry.strokes = strokes.slice(0, saved.strokes);
    },
    /** The field held for a patch's strokes, or for strokes they extend. */
    get(
      key: string,
      strokes: readonly BrushStroke[],
      saved?: RemoveField,
    ): HeldField | undefined {
      const entry = usable(key, strokes, saved);
      if (!entry) {
        return undefined;
      }
      return {
        texels: input(entry.target),
        lattice: entry.lattice,
        strokes: entry.strokes,
      };
    },
    /** Keeps a patch's field past the next sweep. */
    retain(key: string) {
      const entry = fields.get(key);
      if (entry) {
        fields.reserve(key, entry.target.size);
      }
    },
    /** Holds a field a render synthesized for a patch's strokes, in place of what it held. */
    keep(
      key: string,
      strokes: readonly BrushStroke[],
      lattice: FieldLattice,
      texels: Target,
    ) {
      const entry = fields.reserve(key, lattice.size);
      copyRaster(gpu, texels, entry.target);
      Object.assign(entry, { lattice, strokes });
    },
    /** Reads the field held for exactly a patch's strokes, deflated, to save it. */
    async read(key: string, strokes: readonly BrushStroke[]) {
      const entry = fields.get(key);
      if (
        entry?.strokes.length !== strokes.length ||
        !startsWith(strokes, entry.strokes)
      ) {
        return undefined;
      }
      return {
        texels: await readRaster(gpu, entry.target),
        lattice: entry.lattice,
      };
    },
    sweep: fields.sweep,
    inspect: () => fields.inspect("/field"),
    dispose: fields.dispose,
  };
}
