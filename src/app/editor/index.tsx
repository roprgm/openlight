import { type ReactNode, useState } from "react";
import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import { DocumentProvider } from "@/components/editor/session";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { CropButton } from "@/features/crop/button";
import { CropEditor } from "@/features/crop/view";
import { EditorCanvas } from "./canvas";
import { Sidebar } from "./sidebar";

function AdjustmentEditor({ children }: { children: ReactNode }) {
	return (
		<RendererProvider>
			<EditorCanvas />
			<Sidebar>{children}</Sidebar>
		</RendererProvider>
	);
}

function DocumentEditor() {
	const [cropping, setCropping] = useState(false);
	if (cropping) {
		return <CropEditor onClose={() => setCropping(false)} />;
	}
	return (
		<AdjustmentEditor>
			<CropButton onClick={() => setCropping(true)} />
		</AdjustmentEditor>
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
				<DocumentEditor />
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
