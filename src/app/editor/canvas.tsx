import { useScene } from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import { SelectionImage } from "@/features/select/image";
import { ComparisonDivider } from "./comparison-divider";

export function EditorCanvas() {
	const size = useScene((scene) => scene.frame.size);
	return (
		<EditorViewport size={size} overlay={<ComparisonDivider />}>
			<SelectionImage />
		</EditorViewport>
	);
}
