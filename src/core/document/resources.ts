import type { ImageSource } from "@/core/image";
import type { LookupTable } from "@/core/image/lut";

/** Owns the document's files, with each image's GPU target and each LUT's table, outside scene history. */
export function createResources() {
  const images = new Map<string, { file: File } & ImageSource>();
  const luts = new Map<string, { file: File } & LookupTable>();
  let disposed = false;
  function checkNew(id: string) {
    if (disposed) {
      throw new Error("Document is closed.");
    }
    if (images.has(id) || luts.has(id)) {
      throw new Error("Resource already exists.");
    }
  }
  return {
    /** A saved document restores each source under its original ID. */
    add(file: File, source: ImageSource, id: string = crypto.randomUUID()) {
      checkNew(id);
      images.set(id, { file, ...source });
      return id;
    },
    get(id: string) {
      const resource = images.get(id);
      if (!resource) {
        throw new Error("Image resource is unavailable.");
      }
      return resource;
    },
    addLut(file: File, lut: LookupTable, id: string = crypto.randomUUID()) {
      checkNew(id);
      luts.set(id, { file, ...lut });
      return id;
    },
    getLut(id: string) {
      const resource = luts.get(id);
      if (!resource) {
        throw new Error("LUT is unavailable.");
      }
      return resource;
    },
    retain(ids: ReadonlySet<string>) {
      for (const [id, source] of images) {
        if (!ids.has(id)) {
          source.dispose();
          images.delete(id);
        }
      }
      for (const id of luts.keys()) {
        if (!ids.has(id)) {
          luts.delete(id);
        }
      }
    },
    /** Tables hold no GPU memory, so they stay readable to an export still rendering the closed document. */
    dispose() {
      disposed = true;
      for (const source of images.values()) {
        source.dispose();
      }
      images.clear();
    },
  };
}
