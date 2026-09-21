import { useStore } from "zustand";
import Editor from "@/app/editor";
import { useWorkspace } from "@/app/workspace/use-workspace";
import { useFileDrop } from "@/hooks/use-file-drop";

export default function App() {
  const { workspace, controls } = useWorkspace();
  useFileDrop(controls.openFiles);
  const state = useStore(workspace.state);
  return <Editor state={state} onOpen={controls.openFiles} />;
}
