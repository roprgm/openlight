import { Image } from "@/components/editor/image";
import { useScene } from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import { GradientOverlay } from "@/features/layers/gradient-overlay";
import { useGradientTool } from "@/features/layers/gradient-tool";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { ComparisonDivider } from "./comparison-divider";
import { modes, useMode } from "./modes";

export function EditorCanvas() {
	const tool = useGradientTool();
	const { setMode } = useMode();
	useShortcuts({
		g: () => {
			setMode(modes[0]);
			tool.draw();
		},
	});
	const size = useScene((scene) => scene.frame.size);
	return (
		<EditorViewport
			size={size}
			overlay={<ComparisonDivider />}
			tools={<GradientOverlay key={tool.target ?? "selection"} />}
		>
			<Image original="originalImage" />
		</EditorViewport>
	);
}
