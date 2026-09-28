import { useStore } from "zustand";
import { Assistant } from "@/app/assistant";
import { DraftNotice } from "@/app/draft/notice";
import { Editor } from "@/app/editor";
import { useWorkspace } from "@/app/workspace/use-workspace";
import { useFileDrop } from "@/hooks/use-file-drop";

/** Visiting /demo opens a bundled photo instead of the empty state. */
const startup = location.pathname === "/demo" ? "/images/demo.jpg" : undefined;

/** The experimental assistant mounts only when the URL asks for it, as in `/?assistant`. */
const assistant = new URLSearchParams(location.search).has("assistant");

export function App() {
  const { workspace, controls, drafts } = useWorkspace(startup);
  useFileDrop(controls.openFiles);
  const state = useStore(workspace.state);
  const { available, error } = useStore(drafts.state);
  const recovery = available
    ? { onRecover: drafts.recover, onForget: drafts.forget }
    : undefined;
  return (
    <>
      <Editor
        state={state}
        onOpen={controls.openFiles}
        onDismissFailure={workspace.dismissFailure}
        draft={recovery}
      />
      {error && <DraftNotice error={error} onDismiss={drafts.dismiss} />}
      {assistant && state.document && (
        <Assistant workspace={workspace} controls={controls} />
      )}
    </>
  );
}
