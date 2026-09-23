import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { z } from "zod/mini";
import { openScene, snapshotScene } from "@/app/scene-file";
import type { EditorDocument } from "@/core/document";
import type { ImageSource } from "@/core/image";
import { parse } from "@/lib/parse";

/** Raised only when older drafts can no longer open as written; the scene inside keeps its own version. */
const version = 1;

/** The latest document: the scene JSON a scene file holds, while its source files live in their own store by ID. */
const recordSchema = z.object(
  {
    version: z.int().check(z.minimum(1)),
    name: z.string(),
    scene: z.unknown(),
  },
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

interface DraftDatabase extends DBSchema {
  draft: { key: "latest"; value: unknown };
  sources: { key: string; value: Blob };
}

/**
 * One draft in IndexedDB: the record under a single key, and source files keyed by source ID.
 * Operations run one at a time in call order, so a discard never races a save.
 */
export function createDraftStore(name = "openlight") {
  let database: Promise<IDBPDatabase<DraftDatabase>> | undefined;
  let queue = Promise.resolve();

  function connect() {
    if (!globalThis.indexedDB) {
      return Promise.reject(Error("IndexedDB is unavailable."));
    }
    database ??= openDB<DraftDatabase>(name, 1, {
      upgrade(database) {
        database.createObjectStore("draft");
        database.createObjectStore("sources");
      },
    }).catch((error) => {
      database = undefined;
      throw error;
    });
    return database;
  }

  function run<T>(task: (database: IDBPDatabase<DraftDatabase>) => Promise<T>) {
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
        const stored = await sources.getAllKeys();
        await Promise.all([
          transaction.objectStore("draft").put(record, "latest"),
          ...[...files]
            .filter(([id]) => !stored.includes(id))
            .map(([id, file]) => sources.put(file, id)),
          ...stored
            .filter((id) => !files.has(id))
            .map((id) => sources.delete(id)),
          transaction.done,
        ]);
      });
    },
    /** The draft's display name, without reading its source files. */
    peek() {
      return run(async (database) => {
        const record = await database.get("draft", "latest");
        return record && { name: readRecord(record).name };
      });
    },
    /** The record with every stored source file; a save leaves only the files the draft uses. */
    read() {
      return run(async (database): Promise<Draft | undefined> => {
        const transaction = database.transaction(["draft", "sources"]);
        const sources = transaction.objectStore("sources");
        const [record, ids, blobs] = await Promise.all([
          transaction.objectStore("draft").get("latest"),
          sources.getAllKeys(),
          sources.getAll(),
          transaction.done,
        ]);
        if (!record) {
          return undefined;
        }
        return {
          record: readRecord(record),
          files: new Map(ids.map((id, index) => [id, blobs[index]])),
        };
      });
    },
    discard() {
      return run(async (database) => {
        const transaction = database.transaction(
          ["draft", "sources"],
          "readwrite",
        );
        await Promise.all([
          transaction.objectStore("draft").clear(),
          transaction.objectStore("sources").clear(),
          transaction.done,
        ]);
      });
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
