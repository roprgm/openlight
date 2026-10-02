import type { ImageSource } from "@/core/image";

/**
 * Owns the document's image files and GPU targets, the deflated pixels paint layers settled into, and
 * the deflated texels of Remove fields, outside scene history.
 */
export function createResources() {
  const images = new Map<string, { file: File } & ImageSource>();
  const paints = new Map<string, Blob>();
  const fields = new Map<string, Blob>();
  let disposed = false;
  function open() {
    if (disposed) {
      throw new Error("Document is closed.");
    }
  }
  return {
    /** A saved document restores each source under its original ID. */
    add(file: File, source: ImageSource, id: string = crypto.randomUUID()) {
      open();
      if (images.has(id)) {
        throw new Error("Image resource already exists.");
      }
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
    /** A saved document restores settled paint under its original ID too. */
    addPaint(pixels: Blob, id: string = crypto.randomUUID()) {
      open();
      paints.set(id, pixels);
      return id;
    },
    paint(id: string) {
      const pixels = paints.get(id);
      if (!pixels) {
        throw new Error("Settled paint is unavailable.");
      }
      return pixels;
    },
    /** A saved document restores Remove fields under their original IDs too. */
    addField(texels: Blob, id: string = crypto.randomUUID()) {
      open();
      fields.set(id, texels);
      return id;
    },
    field(id: string) {
      const texels = fields.get(id);
      if (!texels) {
        throw new Error("Remove field is unavailable.");
      }
      return texels;
    },
    /** Frees what no retained scene names. */
    retain(ids: ReadonlySet<string>) {
      for (const [id, source] of images) {
        if (!ids.has(id)) {
          source.dispose();
          images.delete(id);
        }
      }
      for (const stored of [paints, fields]) {
        for (const id of stored.keys()) {
          if (!ids.has(id)) {
            stored.delete(id);
          }
        }
      }
    },
    dispose() {
      disposed = true;
      for (const source of images.values()) {
        source.dispose();
      }
      images.clear();
      paints.clear();
      fields.clear();
    },
  };
}
