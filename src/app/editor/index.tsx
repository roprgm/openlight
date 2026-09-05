import { Canvas } from "vgpu-react";
import { useStore } from "zustand";
import {
	DocumentProvider,
	useDocument,
	useScene,
} from "@/app/document/provider";
import type { Workspace } from "@/app/workspace";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import { ComparisonDivider } from "./comparison-divider";
import { CropCanvas } from "./crop/canvas";
import { CanvasRenderer } from "./renderer";
import { RendererProvider } from "./renderer/provider";
import { Sidebar } from "./sidebar";

type WorkspaceProps = { size: readonly [number, number] };

function ImageCanvas({ size }: WorkspaceProps) {
	const { ref, view, handlers } = usePanZoom(size);

	return (
		<div
			className="relative grid min-h-0 min-w-0 flex-1 overflow-hidden cursor-grab touch-none place-items-center active:cursor-grabbing"
			ref={ref}
			{...handlers}
		>
			<Canvas className="size-full min-h-0">
				<CanvasRenderer view={view} />
			</Canvas>
			<ComparisonDivider />
		</div>
	);
}

function DocumentCanvas() {
	const crop = useStore(useDocument().preview, (state) => state.crop);
	const size = useScene((scene) => scene.size);
	if (crop) {
		return <CropCanvas />;
	}
	return <ImageCanvas key={size.join("x")} size={size} />;
}

type EditorProps = { state: ReturnType<Workspace["state"]["getState"]> };

function LoadingStatus({ state }: EditorProps) {
	if (state.status !== "error") {
		return <Spinner />;
	}
	return (
		<p className="max-w-md text-center text-neutral-400">
			Couldn't open {state.file}: {state.error}
		</p>
	);
}

function EditorContent({ state }: EditorProps) {
	if (state.status === "ready") {
		const { document } = state;
		const image = document.resources.get(
			document.scene.getState().source,
		).image;
		return (
			<DocumentProvider value={document}>
				<RendererProvider source={image}>
					<DocumentCanvas />
					<Sidebar />
				</RendererProvider>
			</DocumentProvider>
		);
	}
	return (
		<>
			<div className="grid flex-1 place-items-center">
				<LoadingStatus state={state} />
			</div>
			<ResizablePanel />
		</>
	);
}

export default function Editor({ state }: EditorProps) {
	return (
		<main className="flex h-dvh flex-col md:flex-row">
			<EditorContent state={state} />
		</main>
	);
}
