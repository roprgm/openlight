import type { Workspace } from "@/app/workspace";
import type { EditorDocument } from "@/core/document";
import { type DraftStore, snapshotDraft } from "./store";

/**
 * Keeps the workspace's document as the draft once it has an edit, so opening an image alone never replaces one.
 * Saves wait for `delay` after the last change and flush when the page hides; the store runs them in order.
 */
export function createAutosave(
  workspace: Workspace,
  store: DraftStore,
  onError: (error: unknown) => void,
  delay = 1500,
) {
  let watched: { document: EditorDocument; name: string } | undefined;
  let changed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!changed || !watched) {
      return;
    }
    changed = false;
    store.save(snapshotDraft(watched.document, watched.name)).catch(onError);
  }

  // The workspace publishes a replacement before disposing the old document, so its last edits still flush here.
  function watch() {
    const { document, file } = workspace.state.getState();
    if (document === watched?.document) {
      return;
    }
    flush();
    unsubscribe();
    watched = document && { document, name: file };
    unsubscribe =
      document?.scene.subscribe(() => {
        changed = true;
        clearTimeout(timer);
        timer = setTimeout(flush, delay);
      }) ?? (() => {});
  }

  function hidden() {
    if (window.document.visibilityState === "hidden") {
      flush();
    }
  }

  const detach = workspace.state.subscribe(watch);
  window.addEventListener("pagehide", flush);
  window.document.addEventListener("visibilitychange", hidden);
  return {
    dispose() {
      flush();
      detach();
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      window.document.removeEventListener("visibilitychange", hidden);
    },
  };
}
