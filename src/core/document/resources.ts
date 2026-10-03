import type { ImageSource } from "@/core/image";
import type { Point } from "@/core/image/frame";

/**
 * Where each pixel of a Remove patch copies from, synthesized once and kept, so the layers below and
 * the renderer can't change what the patch shows; the copied colors still follow the layers below.
 */
export type RemoveField = {
  /** Each texel's offset to its donor, in texels, deflated; zero keeps the pixel. */
  readonly texels: Blob;
  /** Where its first texel's corner sits, in source pixels. */
  readonly origin: Point;
  /** Source pixels per texel. */
  readonly scale: number;
  /** Texels across and down. */
  readonly size: Point;
};

/** A Remove field resource: its field once synthesized, or until then the field its synthesis extends. */
export type FieldRecord = {
  readonly field?: RemoveField;
  readonly base?: string;
};

/**
 * Owns the document's image files and GPU targets, the deflated pixels paint layers settled into, and
 * Remove fields, outside scene history.
 */
export function createResources() {
  const images = new Map<string, { file: File } & ImageSource>();
  const paints = new Map<string, Blob>();
  const fields = new Map<string, FieldRecord>();
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
    /** Reserves a Remove field for a new set of strokes, which extends `base` once synthesized. */
    reserveField(base?: string) {
      open();
      const id = crypto.randomUUID();
      fields.set(id, base ? { base } : {});
      return id;
    },
    /** A saved document restores Remove fields under their original IDs. */
    addField(id: string, record: FieldRecord) {
      open();
      fields.set(id, record);
    },
    /** Keeps the field synthesized for a reserved ID; the first one stays, and a closed document drops it. */
    fillField(id: string, field: RemoveField) {
      if (!disposed && fields.has(id) && !fields.get(id)?.field) {
        fields.set(id, { field });
      }
    },
    field(id: string) {
      return fields.get(id);
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
