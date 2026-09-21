import { useStore } from "zustand";
import Editor from "@/app/editor";
import { useWorkspace } from "@/app/workspace/use-workspace";
import { useFileDrop } from "@/hooks/use-file-drop";

/** Visiting /demo opens a bundled photo instead of the empty state. */
const startup = location.pathname === "/demo" ? "/images/demo.jpg" : undefined;

export default function App() {
  const { workspace, controls } = useWorkspace(startup);
  useFileDrop(controls.openFiles);
  const state = useStore(workspace.state);
  return <Editor state={state} onOpen={controls.openFiles} />;
}
