import { useStore } from "zustand";
import { useFileDrop } from "@/hooks/use-file-drop";
import Editor from "./editor";
import Landing from "./landing";
import { useWorkspace } from "./workspace/use-workspace";

export default function App() {
	const { workspace, controls } = useWorkspace();
	useFileDrop(controls.openFiles);
	const state = useStore(workspace.state);
	if (state.status === "empty") {
		return <Landing onOpen={controls.openFiles} />;
	}
	return <Editor state={state} />;
}
