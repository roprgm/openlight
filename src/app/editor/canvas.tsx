import { Image } from "@/components/editor/image";
import { useScene } from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import { GradientOverlay } from "@/features/layers/gradient-overlay";
import { useGradientTool } from "@/features/layers/gradient-tool";
import { LayerToolbar } from "@/features/layers/toolbar";
import { ComparisonDivider } from "./comparison-divider";

export function EditorCanvas() {
	const tool = useGradientTool();
	let gradientKey = "selection";
	if (tool.target?.kind === "new") {
		gradientKey = `new/${tool.target.shape}/${tool.target.parentId ?? "root"}/${tool.target.operation}`;
	}
	const size = useScene((scene) => scene.frame.size);
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<LayerToolbar />
			<EditorViewport
				size={size}
				overlay={<ComparisonDivider />}
				tools={<GradientOverlay key={gradientKey} />}
			>
				<Image original="originalImage" />
			</EditorViewport>
		</div>
	);
}
