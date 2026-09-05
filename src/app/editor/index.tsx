import { DocumentProvider, useScene } from "@/app/document/provider";
import type { Workspace } from "@/app/workspace";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { EditorCanvas } from "./canvas";
import { RendererProvider } from "./renderer/provider";
import { Sidebar } from "./sidebar";

function DocumentCanvas() {
	const size = useScene((scene) => scene.size);
	return <EditorCanvas key={size.join("x")} size={size} />;
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
			<DocumentProvider key={document.id} value={document}>
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
