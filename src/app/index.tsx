import { useStore } from "zustand";
import Editor from "@/app/editor";
import Landing from "@/app/landing";
import { useWorkspace } from "@/app/workspace/use-workspace";
import { useFileDrop } from "@/hooks/use-file-drop";

export default function App() {
  const { workspace, controls } = useWorkspace();
  useFileDrop(controls.openFiles);
  const state = useStore(workspace.state);
  if (state.status === "empty") {
    return <Landing onOpen={controls.openFiles} />;
  }
  return <Editor state={state} />;
}
