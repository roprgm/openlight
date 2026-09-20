import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import {
	DocumentProvider,
	EditorPanel,
	useDocument,
} from "@/components/editor/session";
import Button from "@/components/ui/button";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import type { EffectLayer, Gradient } from "@/core/document";
import { findLayer } from "@/core/document";
import { LayersControls } from "@/features/layers/controls";
import { addLayer } from "@/features/layers/edits";
import {
	GradientProvider,
	useGradientTool,
} from "@/features/layers/gradient-tool";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { EditorCanvas } from "./canvas";
import { ComparisonControl } from "./comparison-control";
import { EditorHeader } from "./header";
import { ImageHistogram } from "./histogram";
import { HistoryControls } from "./history";
import { createLayer, createMask } from "./layers";
import { ModeRail } from "./mode-rail";
import { type Mode, ModeProvider, modes, useMode } from "./modes";
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
	function add(kind: EffectLayer["kind"]) {
		const scene = document.scene.getState();
		const selected = document.selection.getState().layerId;
		const layer = findLayer(scene.layers, selected);
		const placement =
			layer?.kind === "mask" && scene.layers.includes(layer)
				? { inside: selected }
				: { above: selected };
		addLayer(document, createLayer(kind), placement);
	}
	return (
		<EditorPanel
			footer={<LayersControls onSelect={() => setMode(modes[0])} onAdd={add} />}
		>
			<ImageHistogram />
		</EditorPanel>
	);
}

function ExportButton() {
	const { mode, setMode } = useMode();
	const target: Mode = mode.id === "export" ? modes[0] : modes[2];
	return (
		<Button
			aria-pressed={mode.id === "export"}
			title="Export (E)"
			className="ml-1 aria-pressed:bg-neutral-600"
			onClick={() => setMode(target)}
		>
			Export
		</Button>
	);
}

function DocumentEditor({ file }: { file: string }) {
	const document = useDocument();
	function addMask(
		mask: Gradient,
		target: { parentId?: string; operation: "add" | "subtract" },
	) {
		const scene = document.scene.getState();
		const selected = document.selection.getState().layerId;
		// A new top-level mask goes above the selection's root ancestor.
		const root =
			scene.layers.find((item) => findLayer([item], selected)) ??
			scene.layers[0];
		const placement = target.parentId
			? { inside: target.parentId }
			: { above: root.id };
		addLayer(document, createMask(mask, target.operation), placement);
	}
	return (
		<GradientProvider onCreate={addMask}>
			<ModeProvider>
				<EditorHeader file={file}>
					<HistoryControls />
					<ComparisonControl />
					<ExportButton />
				</EditorHeader>
				<div className="flex min-h-0 flex-1 flex-col md:flex-row">
					<ModeRail />
					<ModeView />
					<EditorSidebar />
				</div>
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
					<DocumentEditor file={state.file} />
				</RendererProvider>
			</DocumentProvider>
		);
	}
	return (
		<>
			<EditorHeader file={state.file} />
			<div className="flex min-h-0 flex-1 flex-col md:flex-row">
				<div className="grid flex-1 place-items-center">
					<LoadingStatus state={state} />
				</div>
				<ResizablePanel />
			</div>
		</>
	);
}
export default function Editor({ state }: EditorProps) {
	return (
		<main className="flex h-dvh flex-col">
			<EditorContent state={state} />
		</main>
	);
}
