import { type Gpu, type Target, target } from "vgpu";

type Size = readonly [number, number];

/**
 * Rasters by ID, each at the size it needs and transparent at first, kept while renders use them:
 * `reserve` marks one used, and `sweep` frees those no render reserved since the last sweep. `onFree`
 * lets go of anything that points into a raster before it goes.
 */
export function createRasterCache<E extends { target: Target }>(
  gpu: Gpu,
  format: GPUTextureFormat,
  create: (target: Target) => E,
  onFree: (entry: E) => void = () => {},
) {
  const entries = new Map<string, E>();
  const used = new Set<E>();
  function free(id: string, entry: E) {
    onFree(entry);
    entry.target.color.dispose();
    entries.delete(id);
  }
  return {
    get: (id: string) => entries.get(id),
    get size() {
      return entries.size;
    },
    /** The raster for `id` at `size`, created, or created again at a new size, and marked used. */
    reserve(id: string, size: Size) {
      let entry = entries.get(id);
      if (
        entry &&
        (entry.target.size[0] !== size[0] || entry.target.size[1] !== size[1])
      ) {
        free(id, entry);
        entry = undefined;
      }
      if (!entry) {
        entry = create(
          target(gpu, { size: [...size], format, clearColor: [0, 0, 0, 0] }),
        );
        entries.set(id, entry);
      }
      used.add(entry);
      return entry;
    },
    sweep() {
      for (const [id, entry] of entries) {
        if (!used.has(entry)) {
          free(id, entry);
        }
      }
      used.clear();
    },
    inspect(suffix = "") {
      return [...entries].map(([id, { target }]) => ({
        id: `${id}${suffix}`,
        size: [...target.size],
        format: target.format,
      }));
    },
    dispose() {
      for (const { target } of entries.values()) {
        target.color.dispose();
      }
      entries.clear();
      used.clear();
    },
  };
}
