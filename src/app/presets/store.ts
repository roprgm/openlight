import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { type Preset, presetJson } from "./file";

interface PresetDatabase extends DBSchema {
  presets: { key: string; value: unknown };
}

/** Named presets in IndexedDB apart from the draft, each stored as its file's JSON under its ID. */
export function createPresetStore(name = "openlight-presets") {
  let database: Promise<IDBPDatabase<PresetDatabase>> | undefined;

  function connect() {
    if (!globalThis.indexedDB) {
      return Promise.reject(Error("IndexedDB is unavailable."));
    }
    database ??= openDB<PresetDatabase>(name, 1, {
      upgrade(database) {
        database.createObjectStore("presets");
      },
    }).catch((error) => {
      database = undefined;
      throw error;
    });
    return database;
  }

  return {
    /** Every stored record by ID, as whichever version wrote it. */
    async read() {
      const transaction = (await connect()).transaction("presets");
      const [ids, records] = await Promise.all([
        transaction.store.getAllKeys(),
        transaction.store.getAll(),
        transaction.done,
      ]);
      return ids.map((id, index) => [id, records[index]] as const);
    },
    async put(id: string, preset: Preset) {
      await (await connect()).put("presets", presetJson(preset), id);
    },
    async delete(id: string) {
      await (await connect()).delete("presets", id);
    },
  };
}

export type PresetStore = ReturnType<typeof createPresetStore>;
