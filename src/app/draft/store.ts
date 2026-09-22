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

/** Opens a draft through the same validation as a scene file. */
export async function openDraft(
  { record, files }: Draft,
  decode: (file: File) => Promise<ImageSource>,
) {
  if (!Number.isInteger(record?.version) || record.version < 1) {
    throw Error("Invalid draft.");
  }
  if (record.version > version) {
    throw Error("This draft needs a newer version of OpenLight.");
  }
  return openScene(record.scene, files, decode);
}

function request<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

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
        const sources = transaction.objectStore("sources");
        const stored = await request(sources.getAllKeys());
        transaction.objectStore("draft").put(record, "latest");
        for (const [id, file] of files) {
          if (!stored.includes(id)) {
            sources.put(file, id);
          }
        }
        for (const id of stored) {
          if (typeof id === "string" && !files.has(id)) {
            sources.delete(id);
          }
        }
        await complete(transaction);
      });
    },
    /** The draft's display name, without reading its source files. */
    peek() {
      return run(async (database) => {
        const transaction = database.transaction("draft");
        const record: DraftRecord | undefined = await request(
          transaction.objectStore("draft").get("latest"),
        );
        return record && { name: String(record.name) };
      });
    },
    read() {
      return run(async (database): Promise<Draft | undefined> => {
        const transaction = database.transaction(["draft", "sources"]);
        const record: DraftRecord | undefined = await request(
          transaction.objectStore("draft").get("latest"),
        );
        if (!record) {
          return undefined;
        }
        const sources = transaction.objectStore("sources");
        const files = new Map<string, Blob>();
        for (const id of Object.keys(record.scene?.sources ?? {})) {
          const file: Blob | undefined = await request(sources.get(id));
          if (file) {
            files.set(id, file);
          }
        }
        return { record, files };
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
