import { useStore } from "zustand";
import { Assistant } from "@/app/assistant";
import { DraftNotice } from "@/app/draft/notice";
import { Editor } from "@/app/editor";
import { useWorkspace } from "@/app/workspace/use-workspace";
import { useFileDrop } from "@/hooks/use-file-drop";

/** A bundled photo that the empty state offers and that visiting /demo opens. */
const samplePhoto = "/images/demo.jpg";
const startup = location.pathname === "/demo" ? samplePhoto : undefined;

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
        onOpenSample={() => void controls.loadUrl(samplePhoto)}
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
