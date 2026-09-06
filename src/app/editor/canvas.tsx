import { Image } from "@/components/editor/image";
import { useScene } from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import { ComparisonDivider } from "./comparison-divider";

export function EditorCanvas() {
	const size = useScene((scene) => scene.frame.size);
	return (
		<EditorViewport size={size} overlay={<ComparisonDivider />}>
			<Image original="originalImage" />
		</EditorViewport>
	);
}
