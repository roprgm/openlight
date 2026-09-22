import { isSettingsFile, readSettings } from "@/app/settings";
import type { Workspace } from "@/app/workspace";
import type { FileLoader } from "./registry";

/** Replaces the current document's scene with a settings file's as one undoable edit. */
export function createSettingsLoader(workspace: Workspace): FileLoader {
  return {
    kind: "settings",
    accepts: isSettingsFile,
    async load(file) {
      if (!(file instanceof File)) {
        throw new Error("importSettings requires a File.");
      }
      const document = workspace.getDocument();
      const text = await file.text();
      if (workspace.state.getState().document !== document) {
        return;
      }
      const scene = readSettings(text, document);
      document.history.commit();
      document.edit(scene);
    },
  };
}
