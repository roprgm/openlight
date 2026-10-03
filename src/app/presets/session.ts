import { createStore } from "zustand/vanilla";
import type { EditorDocument } from "@/core/document";
import { parse } from "@/lib/parse";
import { type Preset, presetName, readPreset, readPresetFile } from "./file";
import {
  applySettings,
  type Category,
  copySettings,
  type Settings,
} from "./settings";
import type { PresetStore } from "./store";

export type StoredPreset = Preset & { readonly id: string };

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function byName(a: StoredPreset, b: StoredPreset) {
  return a.name.localeCompare(b.name);
}

/**
 * Settings copied from a photo and the stored presets, which outlive each document. A failure shows as
 * `error` and leaves the photo, its history, and the stored presets as they were.
 */
export function createPresetSession(store: PresetStore) {
  const state = createStore<{
    copied?: Settings;
    /** Sorted by name. */
    presets: readonly StoredPreset[];
    error?: string;
  }>(() => ({ presets: [] }));
  function fail(action: string, error: unknown) {
    state.setState({ error: `${action}: ${message(error)}` });
  }
  function add(preset: StoredPreset) {
    state.setState(({ presets }) => ({
      presets: [...presets, preset].sort(byName),
    }));
  }
  /** A record that no longer reads stays stored, for the version that wrote it. */
  function readStored(records: Awaited<ReturnType<PresetStore["read"]>>) {
    return records.flatMap(([id, record]) => {
      try {
        return [{ id, ...readPreset(record) }];
      } catch (error) {
        fail("A stored preset couldn't be read", error);
        return [];
      }
    });
  }
  // Changes wait for the stored presets, so the list read never drops one saved meanwhile.
  const loading = store.read().then(
    (records) => state.setState({ presets: readStored(records).sort(byName) }),
    (error) => fail("Presets can't be kept in this browser", error),
  );
  async function keep(preset: StoredPreset) {
    await loading;
    await store.put(preset.id, preset);
    add(preset);
  }
  return {
    state,
    copy(document: EditorDocument, chosen: ReadonlySet<Category>) {
      state.setState({ copied: copySettings(document, chosen) });
    },
    /** Applies settings as one edit, or shows why the photo can't take them. */
    apply(document: EditorDocument, settings: Settings, name: string) {
      try {
        applySettings(document, settings);
      } catch (error) {
        fail(`Couldn't apply ${name}`, error);
      }
    },
    /** Saves the settings under a name the dialog has checked with `presetName`. */
    save(name: string, settings: Settings) {
      const preset = {
        id: crypto.randomUUID(),
        name: parse(presetName, name, "Invalid preset name"),
        settings,
      };
      return keep(preset).catch((error) =>
        fail(`Couldn't save ${preset.name}`, error),
      );
    },
    async import(file: File) {
      try {
        await keep({
          id: crypto.randomUUID(),
          ...(await readPresetFile(file)),
        });
      } catch (error) {
        fail(`Couldn't import ${file.name}`, error);
      }
    },
    async remove({ id, name }: StoredPreset) {
      try {
        await store.delete(id);
        state.setState(({ presets }) => ({
          presets: presets.filter((preset) => preset.id !== id),
        }));
      } catch (error) {
        fail(`Couldn't delete ${name}`, error);
      }
    },
    dismiss() {
      state.setState({ error: undefined });
    },
  };
}

export type PresetSession = ReturnType<typeof createPresetSession>;
