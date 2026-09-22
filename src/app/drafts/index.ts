import type { Gpu } from "vgpu";
import { createStore } from "zustand/vanilla";
import { captureDocument, restoreDocument } from "@/app/persistence/snapshot";
import type { Workspace } from "@/app/workspace";
import type { EditorDocument } from "@/core/document";
import { createDraftStorage } from "./storage";

export type DraftState =
  | { status: "checking" | "empty" }
  | { status: "available"; name: string }
  | { status: "error"; message: string };

const saveDelay = 1500;

/** Owns one browser draft and the subscriptions that keep it current. */
export function createDrafts(gpu: Gpu, workspace: Workspace) {
  const storage = createDraftStorage();
  const state = createStore<DraftState>(() => ({ status: "checking" }));
  let active: EditorDocument | undefined;
  let unsubscribeScene: (() => void) | undefined;
  let unsubscribeWorkspace: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let closed = false;
  let writes = Promise.resolve();
  let revision = 0;

  function report(error: unknown) {
    if (!closed) {
      state.setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Draft storage failed.",
      });
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!active || !dirty) return;
    dirty = false;
    const snapshot = captureDocument(active);
    const name = snapshot.sources[0]?.file.name || "Untitled";
    revision++;
    writes = writes
      .then(() => storage.save(name, snapshot))
      .then(() => {
        if (!closed) state.setState({ status: "available", name });
      }, report);
  }

  function schedule() {
    dirty = true;
    timer ??= setTimeout(flush, saveDelay);
  }

  function attach(document: EditorDocument | undefined) {
    if (active === document) return;
    flush();
    unsubscribeScene?.();
    active = document;
    dirty = false;
    unsubscribeScene = document?.scene.subscribe(schedule);
  }

  async function inspect() {
    const current = ++revision;
    try {
      const name = await storage.peek();
      if (!closed && current === revision) {
        state.setState(
          name ? { status: "available", name } : { status: "empty" },
        );
      }
    } catch (error) {
      report(error);
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") flush();
  }

  return {
    state: {
      getState: state.getState,
      getInitialState: state.getInitialState,
      subscribe: state.subscribe,
    },
    start() {
      attach(workspace.state.getState().document);
      unsubscribeWorkspace = workspace.state.subscribe((next) =>
        attach(next.document),
      );
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", onVisibilityChange);
      void inspect();
    },
    async recoverDraft() {
      await writes;
      try {
        const saved = await storage.load();
        if (!saved) {
          state.setState({ status: "empty" });
          return;
        }
        await workspace.open(saved.name, () =>
          restoreDocument(gpu, saved.snapshot),
        );
        if (workspace.state.getState().status !== "ready") {
          throw new Error("Couldn't restore the saved draft.");
        }
      } catch (error) {
        report(error);
      }
    },
    async discardDraft() {
      await writes;
      try {
        await storage.clear();
        state.setState({ status: "empty" });
      } catch (error) {
        report(error);
      }
    },
    dispose() {
      flush();
      closed = true;
      unsubscribeScene?.();
      unsubscribeWorkspace?.();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void writes.then(() => storage.close());
    },
  };
}
