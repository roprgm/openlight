import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import { DocumentProvider, EditorPanel } from "@/components/editor/session";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { LayersControls } from "@/features/layers/controls";
import { GradientProvider } from "@/features/layers/gradient-tool";
import { EditorCanvas } from "./canvas";
import { ModeRail } from "./mode-rail";
import { ModeProvider, modes, useMode } from "./modes";
import { createEditorRenderer } from "./renderer";

function ModeView() {
	const { mode } = useMode();
	if ("View" in mode) {
		return <mode.View />;
	}
	return (
		<>
			<EditorCanvas />
			<mode.Panel />
		</>
	);
}

function EditorSidebar() {
	const { mode, setMode } = useMode();
	return (
		<EditorPanel>
			{mode.group === "edit" && (
				<LayersControls onSelect={() => setMode(modes[0])} />
			)}
		</EditorPanel>
	);
}

function DocumentEditor() {
	return (
		<GradientProvider>
			<ModeProvider>
				<ModeView />
				<EditorSidebar />
				<ModeRail />
			</ModeProvider>
		</GradientProvider>
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
		return (
			<DocumentProvider key={state.document.id} value={state.document}>
				<RendererProvider createRenderer={createEditorRenderer}>
					<DocumentEditor />
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
