import { z } from "zod";
import { openScene, snapshotScene } from "@/app/scene-file";
import type { EditorDocument } from "@/core/document";
import type { ImageSource } from "@/core/image";
import { parse } from "@/lib/parse";

/** Raised only when older drafts can no longer open as written; the scene inside keeps its own version. */
const version = 1;

/** The latest document: the scene JSON a scene file holds, while its source files live in their own store by ID. */
const recordSchema = z.object(
  { version: z.int().min(1), name: z.string(), scene: z.unknown() },
  "Invalid draft",
);
export type DraftRecord = z.output<typeof recordSchema>;
export type Draft = { record: DraftRecord; files: ReadonlyMap<string, Blob> };

/** A draft of the document shown as `name`, captured synchronously so the document may change or close meanwhile. */
export function snapshotDraft(document: EditorDocument, name: string) {
  const { json, files } = snapshotScene(document);
  return { record: { version, name, scene: json }, files };
}

/** Storage returns whatever an earlier version wrote, so the record is parsed where it is read; the scene opens later. */
function readRecord(record: unknown) {
  const read = parse(recordSchema, record, "Invalid draft");
  if (read.version > version) {
    throw Error("This draft needs a newer version of OpenLight.");
  }
  return read;
}

/** Opens a draft through the same validation as a scene file. */
export async function openDraft(
  { record, files }: Draft,
  decode: (file: File) => Promise<ImageSource>,
) {
  return openScene(readRecord(record).scene, files, decode);
}

/** Resolves once every request issued in the transaction has run, so callers read results from the requests. */
function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? Error("Draft storage was interrupted."));
  });
}

/**
 * One draft in IndexedDB: the record under a single key, and source files keyed by source ID.
 * Operations run one at a time in call order, so a discard never races a save.
 * Requests are issued from the transaction's own callbacks, never after an await, so it can't auto-commit early.
 */
export function createDraftStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  name = "openlight",
) {
  let database: Promise<IDBDatabase> | undefined;
  let queue = Promise.resolve();

  function connect() {
    if (!factory) {
      return Promise.reject(Error("IndexedDB is unavailable."));
    }
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const opening = factory.open(name, 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore("draft");
        opening.result.createObjectStore("sources");
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => reject(Error("Draft storage is blocked."));
    }).catch((error) => {
      database = undefined;
      throw error;
    });
    return database;
  }

  function run<T>(task: (database: IDBDatabase) => Promise<T>) {
    const result = queue.then(async () => task(await connect()));
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  return {
    /** Keeps source files already stored under their ID and deletes the ones the draft no longer uses. */
    save({ record, files }: Draft) {
      return run(async (database) => {
        const transaction = database.transaction(
          ["draft", "sources"],
          "readwrite",
        );
        transaction.objectStore("draft").put(record, "latest");
        const sources = transaction.objectStore("sources");
        const stored = sources.getAllKeys();
        stored.onsuccess = () => {
          for (const [id, file] of files) {
            if (!stored.result.includes(id)) {
              sources.put(file, id);
            }
          }
          for (const id of stored.result) {
            if (typeof id === "string" && !files.has(id)) {
              sources.delete(id);
            }
          }
        };
        await complete(transaction);
      });
    },
    /** The draft's display name, without reading its source files. */
    peek() {
      return run(async (database) => {
        const transaction = database.transaction("draft");
        const record: IDBRequest<unknown> = transaction
          .objectStore("draft")
          .get("latest");
        await complete(transaction);
        return record.result && { name: readRecord(record.result).name };
      });
    },
    /** The record with every stored source file; a save leaves only the files the draft uses. */
    read() {
      return run(async (database): Promise<Draft | undefined> => {
        const transaction = database.transaction(["draft", "sources"]);
        const record: IDBRequest<unknown> = transaction
          .objectStore("draft")
          .get("latest");
        const sources = transaction.objectStore("sources");
        const ids = sources.getAllKeys();
        const blobs: IDBRequest<Blob[]> = sources.getAll();
        await complete(transaction);
        if (!record.result) {
          return undefined;
        }
        const files = new Map<string, Blob>();
        ids.result.forEach((id, index) => {
          if (typeof id === "string") {
            files.set(id, blobs.result[index]);
          }
        });
        return { record: readRecord(record.result), files };
      });
    },
    discard() {
      return run(async (database) => {
        const transaction = database.transaction(
          ["draft", "sources"],
          "readwrite",
        );
        transaction.objectStore("draft").clear();
        transaction.objectStore("sources").clear();
        await complete(transaction);
      });
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
