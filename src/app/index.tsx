import { useStore } from "zustand";
import Editor from "@/app/editor";
import { useWorkspace } from "@/app/workspace/use-workspace";
import { useFileDrop } from "@/hooks/use-file-drop";

/** Visiting /demo opens a bundled photo instead of the empty state. */
const startup = location.pathname === "/demo" ? "/images/demo.jpg" : undefined;

export default function App() {
  const { workspace, controls, drafts } = useWorkspace(startup);
  useFileDrop(controls.openFiles);
  const state = useStore(workspace.state);
  const draft = useStore(drafts.state);
  const recovery =
    draft.status === "available"
      ? {
          name: draft.name,
          onRecover: controls.recoverDraft,
          onDiscard: controls.discardDraft,
        }
      : undefined;
  return (
    <>
      <Editor state={state} onOpen={controls.openFiles} recovery={recovery} />
      {draft.status === "error" && (
        <p
          role="alert"
          className="fixed right-4 bottom-4 z-50 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-300 shadow-lg"
        >
          Local recovery is unavailable: {draft.message} Save an editable scene.
          <button
            type="button"
            className="ml-2 cursor-pointer underline"
            onClick={controls.discardDraft}
          >
            Clear draft
          </button>
        </p>
      )}
    </>
  );
}
