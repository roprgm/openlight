import Editor from "./editor";
import Landing from "./landing";
import { useScene } from "./scene";
import { useControls } from "./scene/controls";

export default function App() {
	const { loadImage } = useControls();
	const source = useScene((scene) => scene.source);
	if (!source) {
		return <Landing onOpen={loadImage} />;
	}
	return <Editor source={source} />;
}
