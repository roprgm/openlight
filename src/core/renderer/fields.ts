import type { Gpu, Target } from "vgpu";
import type { RemoveField } from "@/core/document";
import { input, type RenderInput } from "./node";
import { createRasterCache } from "./raster-cache";
import { copyRaster, readRaster, writeRaster } from "./transfer";

/** Where a field's texels sit in the photo. */
export type FieldLattice = Pick<RemoveField, "origin" | "scale" | "size">;

/** A Remove field a renderer holds. */
export type HeldField = { texels: RenderInput; lattice: FieldLattice };

/** Its lattice once its texels are written, so a load that fails midway holds nothing. */
type Entry = { target: Target; lattice?: FieldLattice };

/** Holds Remove fields by ID, synthesized by a render or loaded from the document. */
export function createFieldStore(gpu: Gpu) {
  const fields = createRasterCache<Entry>(gpu, "rg16float", (target) => ({
    target,
  }));
  return {
    get(id: string): HeldField | undefined {
      const entry = fields.get(id);
      return (
        entry?.lattice && {
          texels: input(entry.target),
          lattice: entry.lattice,
        }
      );
    },
    async load(id: string, { texels, origin, scale, size }: RemoveField) {
      const entry = fields.reserve(id, size);
      entry.lattice = undefined;
      await writeRaster(gpu, entry.target, texels);
      entry.lattice = { origin, scale, size };
    },
    /** Holds a field a render synthesized. */
    keep(id: string, lattice: FieldLattice, texels: Target) {
      const entry = fields.reserve(id, lattice.size);
      copyRaster(gpu, texels, entry.target);
      entry.lattice = lattice;
    },
    /** Reads a held field back, deflated, to save it. */
    async read(id: string): Promise<RemoveField | undefined> {
      const entry = fields.get(id);
      if (!entry?.lattice) {
        return undefined;
      }
      const { lattice } = entry;
      return { texels: await readRaster(gpu, entry.target), ...lattice };
    },
    /** Keeps a field past the next sweep. */
    retain(id: string) {
      const entry = fields.get(id);
      if (entry) {
        fields.reserve(id, entry.target.size);
      }
    },
    sweep: fields.sweep,
    inspect: () => fields.inspect("/field"),
    dispose: fields.dispose,
  };
}
