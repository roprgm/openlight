import type { ReactNode } from "react";
import type { Workspace } from "@/app/workspace";
import { BrushProvider } from "@/components/editor/brush-tool";
import { Image } from "@/components/editor/image";
import { RendererProvider } from "@/components/editor/pipeline";
import {
  DocumentProvider,
  useDocument,
  useScene,
} from "@/components/editor/session";
import { EditorViewport, ViewportStage } from "@/components/editor/viewport";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { Mask } from "@/core/document";
import { findLayer, locateLayer } from "@/core/document";
import { HealingProvider } from "@/features/heal/mode";
import { addLayer } from "@/features/layers/edits";
import { MaskToolProvider, type Nesting } from "@/features/layers/mask-tool";
import { CanvasToolbar } from "@/features/layers/toolbar";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { blurActive } from "@/lib/dom";
import { ComparisonControl } from "./comparison-control";
import { ComparisonDivider } from "./comparison-divider";
import { EmptyEditor, type Recovery } from "./empty";
import { EditorHeader } from "./header";
import { HistoryControls } from "./history";
import { createMask } from "./layers";
import { MaskOverlaySync } from "./mask-overlay";
import { createEditorRenderer } from "./renderer";
import { EditorSidebar } from "./sidebar";
import { ToolRail } from "./tool-rail";
import { exportTool, ToolProvider, tools, useTool } from "./tools";

/** A View replaces the canvas and sidebar; otherwise the tool's Canvas and Options join the shared canvas. */
function ToolView() {
  const { tool, setTool } = useTool();
  const document = useDocument();
  const size = useScene((scene) => scene.frame.size);
  // Enter and Escape leave one level: shape tools return to Adjust, where the selection climbs to the image.
  function up() {
    const layers = document.scene.getState().layers;
    const parent =
      locateLayer(layers, document.selection.getState().layerId)?.parent ??
      layers[0];
    document.selectLayer(parent.id);
  }
  useShortcuts(
    "Canvas" in tool || "View" in tool ? {} : { enter: up, escape: up },
  );
  function close() {
    setTool(tools[0]);
    blurActive();
  }
  if ("View" in tool) {
    return <tool.View onClose={close} />;
  }
  return (
    <>
      <EditorViewport size={size}>
        <ViewportStage>
          <Image original="originalImage" />
          {"Canvas" in tool && <tool.Canvas key={tool.id} />}
        </ViewportStage>
        <ComparisonDivider />
        <CanvasToolbar>{"Options" in tool && <tool.Options />}</CanvasToolbar>
        <MaskOverlaySync />
      </EditorViewport>
      <EditorSidebar />
    </>
  );
}

function ExportButton() {
  const { tool, setTool } = useTool();
  const exporting = tool === exportTool;
  return (
    <Tooltip content="Export the photo or save a scene" shortcut="E">
      <Button
        aria-pressed={exporting}
        className="ml-1 aria-pressed:bg-neutral-600"
        onClick={() => setTool(exporting ? tools[0] : exportTool)}
      >
        Export
      </Button>
    </Tooltip>
  );
}

/** Mask creation and the tool that draws a shape are wired here, where features meet the rail. */
function MaskTools({ children }: { children: ReactNode }) {
  const document = useDocument();
  const { setTool } = useTool();
  function addMask(mask: Mask, nesting: Nesting) {
    const scene = document.scene.getState();
    const selected = document.selection.getState().layerId;
    // A new top-level mask goes above the selection's root ancestor.
    const root =
      scene.layers.find((item) => findLayer([item], selected)) ??
      scene.layers[0];
    const placement = nesting.parentId
      ? { inside: nesting.parentId }
      : { above: root.id };
    addLayer(document, createMask(mask, nesting.operation), placement);
  }
  return (
    <MaskToolProvider
      onCreate={addMask}
      onTool={(shape) => {
        const tool = tools.find((entry) => entry.id === shape);
        if (tool) {
          setTool(tool);
        }
      }}
      onDone={() => setTool(tools[0])}
    >
      {children}
    </MaskToolProvider>
  );
}

/** Connects feature-owned patch selection to the application-owned tool rail. */
function HealingTools({ children }: { children: ReactNode }) {
  const { setTool } = useTool();
  return (
    <HealingProvider
      onEdit={() => {
        const healing = tools.find((tool) => tool.id === "heal");
        if (healing) setTool(healing);
      }}
    >
      {children}
    </HealingProvider>
  );
}

function DocumentEditor({ file }: { file: string }) {
  return (
    <ToolProvider>
      <MaskTools>
        <HealingTools>
          <BrushProvider>
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
              <ToolRail />
              <ToolView />
            </div>
          </BrushProvider>
        </HealingTools>
      </MaskTools>
    </ToolProvider>
  );
}

type EditorProps = {
  state: ReturnType<Workspace["state"]["getState"]>;
  onOpen: (files: File[]) => void;
  draft?: Recovery;
};
function EditorContent({ state, onOpen, draft }: EditorProps) {
  if (state.status !== "ready") {
    return <EmptyEditor state={state} onOpen={onOpen} draft={draft} />;
  }
  return (
    <DocumentProvider key={state.document.id} value={state.document}>
      <RendererProvider createRenderer={createEditorRenderer}>
        <DocumentEditor file={state.file} />
      </RendererProvider>
    </DocumentProvider>
  );
}
export function Editor(props: EditorProps) {
  return (
    <main className="flex h-dvh flex-col">
      <EditorContent {...props} />
    </main>
  );
}
