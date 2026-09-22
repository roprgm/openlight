import { openScene, type SceneJson, snapshotScene } from "@/app/scene-file";
import type { EditorDocument } from "@/core/document";
import type { ImageSource } from "@/core/image";

/** Raised only when older drafts can no longer open as written; the scene inside keeps its own version. */
const version = 1;

/** The latest document: the scene JSON a scene file holds, while its source files live in their own store by ID. */
export type DraftRecord = { version: number; name: string; scene: SceneJson };
export type Draft = { record: DraftRecord; files: ReadonlyMap<string, Blob> };

/** A draft of the document shown as `name`, captured synchronously so the document may change or close meanwhile. */
export function snapshotDraft(document: EditorDocument, name: string): Draft {
  const { json, files } = snapshotScene(document);
  return { record: { version, name, scene: json }, files };
}

/** Storage returns whatever an earlier version wrote, so the record is checked where it is read. */
function validateRecord(record: DraftRecord | undefined): DraftRecord {
  if (
    !record ||
    !Number.isInteger(record.version) ||
    record.version < 1 ||
    typeof record.name !== "string"
  ) {
    throw Error("Invalid draft.");
  }
  if (record.version > version) {
    throw Error("This draft needs a newer version of OpenLight.");
  }
  return record;
}

/** Opens a draft through the same validation as a scene file. */
export async function openDraft(
  { record, files }: Draft,
  decode: (file: File) => Promise<ImageSource>,
) {
  return openScene(validateRecord(record).scene, files, decode);
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
        const record: IDBRequest<DraftRecord | undefined> = transaction
          .objectStore("draft")
          .get("latest");
        await complete(transaction);
        return record.result && { name: validateRecord(record.result).name };
      });
    },
    /** The record with every stored source file; a save leaves only the files the draft uses. */
    read() {
      return run(async (database): Promise<Draft | undefined> => {
        const transaction = database.transaction(["draft", "sources"]);
        const record: IDBRequest<DraftRecord | undefined> = transaction
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
        return { record: validateRecord(record.result), files };
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
