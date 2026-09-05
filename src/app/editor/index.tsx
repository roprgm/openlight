import { Canvas } from "vgpu-react";
import { DocumentProvider } from "@/app/document/provider";
import type { Workspace } from "@/app/workspace";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import { CanvasRenderer } from "./renderer";
import { RendererProvider } from "./renderer/provider";
import { Sidebar } from "./sidebar";

type CanvasProps = { size: readonly [number, number] };

function DocumentCanvas({ size }: CanvasProps) {
	const { ref, view, handlers } = usePanZoom(size);

	return (
		<div
			className="grid min-h-0 min-w-0 flex-1 cursor-grab touch-none place-items-center active:cursor-grabbing"
			ref={ref}
			{...handlers}
		>
			<Canvas aria-label="Document canvas" className="size-full min-h-0">
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
		const { size } = document.scene.getState();
		return (
			<DocumentProvider key={document.id} value={document}>
				<RendererProvider>
					<DocumentCanvas size={size} />
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
