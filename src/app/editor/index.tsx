import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import {
	DocumentProvider,
	EditorPanel,
	useDocument,
} from "@/components/editor/session";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import type { LinearGradient, ProcessingLayer } from "@/core/document";
import { findLayer } from "@/core/document";
import { LayersControls } from "@/features/layers/controls";
import { addLayer } from "@/features/layers/edits";
import { GradientProvider } from "@/features/layers/gradient-tool";
import { EditorCanvas } from "./canvas";
import { FloatingHistogram } from "./histogram";
import { createLayer } from "./layers";
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
	const { setMode } = useMode();
	const document = useDocument();
	function add(kind: ProcessingLayer["kind"]) {
		const scene = document.scene.getState();
		const selected = findLayer(
			scene.layers,
			document.selection.getState().layerId,
		);
		const size = document.resources.get(scene.layers[0].source).image.size;
		const parentId =
			selected?.kind === "mask" && scene.layers.includes(selected)
				? selected.id
				: undefined;
		addLayer(document, createLayer(kind, [size[0], size[1]]), parentId);
	}
	return (
		<EditorPanel>
			<LayersControls onSelect={() => setMode(modes[0])} onAdd={add} />
		</EditorPanel>
	);
}

function DocumentEditor() {
	const document = useDocument();
	function createMask(
		mask: LinearGradient,
		target: { parentId?: string; operation: "add" | "subtract" },
	) {
		const scene = document.scene.getState();
		const size = document.resources.get(scene.layers[0].source).image.size;
		const layer = createLayer("mask", [size[0], size[1]]);
		if (!target.parentId) {
			const selected = document.selection.getState().layerId;
			const root = scene.layers.find((item) => findLayer([item], selected));
			if (root) {
				document.selectLayer(root.id);
			}
		}
		addLayer(
			document,
			{ ...layer, mask, operation: target.operation },
			target.parentId,
		);
	}
	return (
		<GradientProvider onCreate={createMask}>
			<ModeProvider>
				<div className="relative flex min-h-0 min-w-0 flex-1">
					<ModeView />
					<FloatingHistogram />
				</div>
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
