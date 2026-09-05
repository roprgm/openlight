import { Canvas } from "vgpu-react";
import { DocumentProvider } from "@/app/document/provider";
import type { Workspace } from "@/app/workspace";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import type { Target } from "@/lib/decode";
import { CanvasRenderer } from "./renderer";
import { RendererProvider } from "./renderer/provider";
import { Sidebar } from "./sidebar";

type WorkspaceProps = { image: Target };

function ImageCanvas({ image }: WorkspaceProps) {
	const { ref, view, handlers } = usePanZoom(image.size);

	return (
		<div
			className="grid min-h-0 min-w-0 flex-1 cursor-grab touch-none place-items-center active:cursor-grabbing"
			ref={ref}
			{...handlers}
		>
			<Canvas className="size-full min-h-0">
				<CanvasRenderer view={view} />
			</Canvas>
		</div>
	);
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
					<ImageCanvas image={image} />
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
