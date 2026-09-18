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
		l: () => {
			setMode(modes[0]);
			tool.draw();
		},
	});
	let gradientKey = "selection";
	if (tool.target?.kind === "edit") {
		gradientKey = tool.target.id;
	}
	if (tool.target?.kind === "new") {
		gradientKey = `new/${tool.target.parentId ?? "root"}/${tool.target.operation}`;
	}
	const size = useScene((scene) => scene.frame.size);
	return (
		<EditorViewport
			size={size}
			overlay={<ComparisonDivider />}
			tools={<GradientOverlay key={gradientKey} />}
		>
			<Image original="originalImage" />
		</EditorViewport>
	);
}
