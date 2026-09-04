import { useFileDrop } from "@/hooks/use-file-drop";
import { useControls } from "./controls";
import Editor from "./editor";
import Landing from "./landing";
import { useScene } from "./scene";

export default function App() {
	const { openFiles } = useControls();
	useFileDrop(openFiles);
	const source = useScene((scene) => scene.source);
	if (!source) {
		return <Landing onOpen={openFiles} />;
	}
	return <Editor source={source} />;
}
