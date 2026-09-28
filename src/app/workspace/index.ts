import { createStore } from "zustand/vanilla";
import type { EditorDocument } from "@/core/document";

/** A file that could not be opened, and why. */
export type OpenFailure = { file: string; error: string };

/**
 * Without a document, opening shows loading and then an error. With one, the document stays while
 * another file opens, named by `opening`, and a failure to open it stays beside it until dismissed.
 */
type WorkspaceState =
  | { status: "empty"; file?: undefined; document?: undefined }
  | { status: "loading"; file: string; document?: undefined }
  | { status: "error"; file: string; error: string; document?: undefined }
  | {
      status: "ready";
      file: string;
      document: EditorDocument;
      opening?: string;
      failure?: OpenFailure;
    };

function withoutFailure({
  failure: _,
  ...ready
}: Extract<WorkspaceState, { status: "ready" }>) {
  return ready;
}

/** Single-document policy; document instances remain independent of this session. */
export function createWorkspace() {
  const state = createStore<WorkspaceState>(() => ({ status: "empty" }));
  let generation = 0;
  let closed = false;
  return {
    state: {
      getState: state.getState,
      getInitialState: state.getInitialState,
      subscribe: state.subscribe,
    },
    getDocument() {
      const document = state.getState().document;
      if (!document) {
        throw new Error("Load an image before editing.");
      }
      return document;
    },
    /** Resolves whether the file became the open document; a later open wins over an earlier one. */
    async open(file: string, load: () => Promise<EditorDocument>) {
      if (closed) {
        throw new Error("Workspace is closed.");
      }
      const request = ++generation;
      const current = state.getState();
      state.setState(
        current.status === "ready"
          ? { ...withoutFailure(current), opening: file }
          : { status: "loading", file },
        true,
      );
      try {
        const document = await load();
        if (request !== generation) {
          document.dispose();
          return false;
        }
        const previous = state.getState().document;
        // Publishing the replacement first lets autosave flush the previous document's last edits.
        state.setState({ status: "ready", file, document }, true);
        previous?.dispose();
        return true;
      } catch (error) {
        if (request !== generation) {
          return false;
        }
        const latest = state.getState();
        const failure = { file, error: String(error) };
        state.setState(
          latest.status === "ready"
            ? {
                status: "ready",
                file: latest.file,
                document: latest.document,
                failure,
              }
            : { status: "error", ...failure },
          true,
        );
        return false;
      }
    },
    /** Clears a failure shown beside the open document. */
    dismissFailure() {
      const current = state.getState();
      if (current.status === "ready" && current.failure) {
        state.setState(withoutFailure(current), true);
      }
    },
    dispose() {
      closed = true;
      generation++;
      state.getState().document?.dispose();
      state.setState({ status: "empty" }, true);
    },
  };
}
export type Workspace = ReturnType<typeof createWorkspace>;
