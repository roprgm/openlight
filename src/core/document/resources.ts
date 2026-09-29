import type { ImageSource } from "@/core/image";

/**
 * Owns the document's image files and GPU targets, and the deflated pixels paint layers settled into,
 * outside scene history.
 */
export function createResources() {
  const images = new Map<string, { file: File } & ImageSource>();
  const paints = new Map<string, Blob>();
  let disposed = false;
  return {
    /** A saved document restores each source under its original ID. */
    add(file: File, source: ImageSource, id: string = crypto.randomUUID()) {
      if (disposed) {
        throw new Error("Document is closed.");
      }
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
      if (disposed) {
        throw new Error("Document is closed.");
      }
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
    /** Frees what no retained scene names. */
    retain(ids: ReadonlySet<string>) {
      for (const [id, source] of images) {
        if (!ids.has(id)) {
          source.dispose();
          images.delete(id);
        }
      }
      for (const id of paints.keys()) {
        if (!ids.has(id)) {
          paints.delete(id);
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
    },
  };
}
