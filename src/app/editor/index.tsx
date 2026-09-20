import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import {
	DocumentProvider,
	EditorPanel,
	useDocument,
} from "@/components/editor/session";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import type { Gradient, ProcessingLayer } from "@/core/document";
import { findLayer } from "@/core/document";
import { LayersControls } from "@/features/layers/controls";
import { addLayer } from "@/features/layers/edits";
import {
	GradientProvider,
	useGradientTool,
} from "@/features/layers/gradient-tool";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { EditorActions } from "./actions";
import { EditorCanvas } from "./canvas";
import { ImageHistogram } from "./histogram";
import { createLayer } from "./layers";
import { ModeRail } from "./mode-rail";
import { ModeProvider, modes, useMode } from "./modes";
import { createEditorRenderer } from "./renderer";

function ModeView() {
	const { mode } = useMode();
	if ("View" in mode) {
		return (
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<header className="flex h-16 shrink-0 items-center border-b border-black bg-panel px-3 text-neutral-200 text-sm shadow-ridge">
					{mode.label}
				</header>
				<mode.View />
			</div>
		);
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
	const tool = useGradientTool();
	useShortcuts({
		l: () => {
			setMode(modes[0]);
			tool.draw();
		},
		r: () => {
			setMode(modes[0]);
			tool.draw("radial");
		},
	});
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
		<EditorPanel footer={<EditorActions />}>
			<ImageHistogram />
			<LayersControls onSelect={() => setMode(modes[0])} onAdd={add} />
		</EditorPanel>
	);
}

function DocumentEditor() {
	const document = useDocument();
	function createMask(
		mask: Gradient,
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
			{
				...layer,
				name: mask.kind === "radial" ? "Radial Gradient" : "Linear Gradient",
				mask,
				operation: target.operation,
			},
			target.parentId,
		);
	}
	return (
		<GradientProvider onCreate={createMask}>
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
