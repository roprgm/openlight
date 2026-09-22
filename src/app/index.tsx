import { useStore } from "zustand";
import { DraftNotice } from "@/app/draft/notice";
import Editor from "@/app/editor";
import { useWorkspace } from "@/app/workspace/use-workspace";
import { useFileDrop } from "@/hooks/use-file-drop";

/** Visiting /demo opens a bundled photo instead of the empty state. */
const startup = location.pathname === "/demo" ? "/images/demo.jpg" : undefined;

export default function App() {
  const { workspace, controls, drafts } = useWorkspace(startup);
  useFileDrop(controls.openFiles);
  const state = useStore(workspace.state);
  const { available, error } = useStore(drafts.state);
  const recovery =
    available === undefined
      ? undefined
      : {
          name: available,
          onRecover: drafts.recover,
          onForget: drafts.forget,
        };
  return (
    <>
      <Editor state={state} onOpen={controls.openFiles} draft={recovery} />
      {error && <DraftNotice error={error} onDismiss={drafts.dismiss} />}
    </>
  );
}
