import {
  type DocumentSnapshot,
  parseSnapshot,
} from "@/app/persistence/snapshot";
import type { Scene } from "@/core/document";

type DraftRecord = {
  version: 1;
  name: string;
  scene: Scene;
  sourceIds: string[];
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function parseRecord(value: unknown): DraftRecord | undefined {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !("sourceIds" in value) ||
    !Array.isArray(value.sourceIds) ||
    !value.sourceIds.every((id: unknown) => typeof id === "string") ||
    !("scene" in value)
  ) {
    throw new Error("Saved draft uses an unsupported format.");
  }
  return value as DraftRecord;
}

/** One atomic draft record; source Files are written only when their IDs are new. */
export function createDraftStorage() {
  let database: Promise<IDBDatabase> | undefined;
  function open() {
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("openlight-drafts", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("draft");
        db.createObjectStore("assets");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Draft storage is blocked by another tab."));
    });
    return database;
  }

  return {
    async peek() {
      const db = await open();
      const transaction = db.transaction("draft", "readonly");
      const value = await requestResult(
        transaction.objectStore("draft").get("latest"),
      );
      const draft = parseRecord(value);
      return draft?.name;
    },
    async load() {
      const db = await open();
      const transaction = db.transaction(["draft", "assets"], "readonly");
      const draftRequest = transaction.objectStore("draft").get("latest");
      const assets = transaction.objectStore("assets");
      const keysRequest = assets.getAllKeys();
      const filesRequest = assets.getAll();
      const [value, keys, files] = await Promise.all([
        requestResult(draftRequest),
        requestResult(keysRequest),
        requestResult(filesRequest),
      ]);
      const draft = parseRecord(value);
      if (!draft) return undefined;
      const byId = new Map(keys.map((key, index) => [key, files[index]]));
      const sources = draft.sourceIds.map((id) => ({ id, file: byId.get(id) }));
      return {
        name: draft.name,
        snapshot: parseSnapshot({ scene: draft.scene, sources }),
      };
    },
    async save(name: string, snapshot: DocumentSnapshot) {
      const db = await open();
      const transaction = db.transaction(["draft", "assets"], "readwrite");
      const assets = transaction.objectStore("assets");
      const existing = assets.getAllKeys();
      existing.onsuccess = () => {
        const current = new Set(snapshot.sources.map((source) => source.id));
        const previous = new Set(existing.result);
        for (const { id, file } of snapshot.sources) {
          if (!previous.has(id)) assets.put(file, id);
        }
        for (const id of previous) {
          if (!current.has(String(id))) assets.delete(id);
        }
        transaction.objectStore("draft").put(
          {
            version: 1,
            name,
            scene: snapshot.scene,
            sourceIds: snapshot.sources.map((source) => source.id),
          } satisfies DraftRecord,
          "latest",
        );
      };
      await transactionDone(transaction);
    },
    async clear() {
      const db = await open();
      const transaction = db.transaction(["draft", "assets"], "readwrite");
      transaction.objectStore("draft").clear();
      transaction.objectStore("assets").clear();
      await transactionDone(transaction);
    },
    close() {
      void database?.then(
        (db) => db.close(),
        () => {},
      );
    },
  };
}
