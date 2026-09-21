import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import { DocumentProvider, useDocument } from "@/components/editor/session";
import Button from "@/components/ui/button";
import type { Gradient } from "@/core/document";
import { findLayer } from "@/core/document";
import { addLayer } from "@/features/layers/edits";
import {
  GradientProvider,
  useGradientTool,
} from "@/features/layers/gradient-tool";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { EditorCanvas } from "./canvas";
import { ComparisonControl } from "./comparison-control";
import { EmptyEditor } from "./empty";
import { EditorHeader } from "./header";
import { HistoryControls } from "./history";
import { createMask } from "./layers";
import { ModeRail } from "./mode-rail";
import { type Mode, ModeProvider, modes, useMode } from "./modes";
import { createEditorRenderer } from "./renderer";
import { EditorSidebar } from "./sidebar";

/** A View replaces the canvas and sidebar; a Panel fills the sidebar beside the canvas. */
function ModeView() {
  const { mode, setMode } = useMode();
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
  function close() {
    setMode(modes[0]);
    if (window.document.activeElement instanceof HTMLElement) {
      window.document.activeElement.blur();
    }
  }
  if ("View" in mode) {
    return <mode.View onClose={close} />;
  }
  return (
    <>
      <EditorCanvas />
      <EditorSidebar>
        <mode.Panel />
      </EditorSidebar>
    </>
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
          <hr
            aria-orientation="vertical"
            className="mx-1 h-4 w-px border-0 bg-neutral-600"
          />
          <ComparisonControl />
          <ExportButton />
        </EditorHeader>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <ModeRail />
          <ModeView />
        </div>
      </ModeProvider>
    </GradientProvider>
  );
}

type EditorProps = {
  state: ReturnType<Workspace["state"]["getState"]>;
  onOpen: (files: File[]) => void;
};
function EditorContent({ state, onOpen }: EditorProps) {
  if (state.status !== "ready") {
    return <EmptyEditor state={state} onOpen={onOpen} />;
  }
  return (
    <DocumentProvider key={state.document.id} value={state.document}>
      <RendererProvider createRenderer={createEditorRenderer}>
        <DocumentEditor file={state.file} />
      </RendererProvider>
    </DocumentProvider>
  );
}
export default function Editor(props: EditorProps) {
  return (
    <main className="flex h-dvh flex-col">
      <EditorContent {...props} />
    </main>
  );
}
