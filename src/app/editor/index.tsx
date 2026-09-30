import { Button } from "@roprgm/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import type { ReactNode } from "react";
import type { Workspace } from "@/app/workspace";
import { BrushProvider, useBrushTool } from "@/components/editor/brush-tool";
import { Image } from "@/components/editor/image";
import {
  EditorFrame,
  EditorLayout,
  useDesktopLayout,
} from "@/components/editor/layout";
import { RendererProvider } from "@/components/editor/pipeline";
import {
  DocumentProvider,
  useDocument,
  useScene,
} from "@/components/editor/session";
import { EditorViewport, ViewportStage } from "@/components/editor/viewport";
import type { Mask } from "@/core/document";
import { locateLayer } from "@/core/document";
import { HealingProvider } from "@/features/heal/mode";
import { addLayer } from "@/features/layers/edits";
import { MaskToolProvider, type Nesting } from "@/features/layers/mask-tool";
import { CanvasToolbar } from "@/features/layers/toolbar";
import { PaintSettling } from "@/features/paint/settle";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { blurActive } from "@/lib/dom";
import { BrushKeys } from "./brush-keys";
import { ComparisonControl } from "./comparison-control";
import { ComparisonDivider } from "./comparison-divider";
import { DockPanel, DockProvider, DockTabs } from "./dock";
import { EmptyEditor, type Recovery } from "./empty";
import { EditorHeader } from "./header";
import { ImageHistogram } from "./histogram";
import { HistoryControls } from "./history";
import { createMask } from "./layers";
import { MaskOverlaySync } from "./mask-overlay";
import { OpenButton, OpenContext, OpenStatus } from "./open";
import { createEditorRenderer } from "./renderer";
import { EditorSidebar } from "./sidebar";
import { ToolRail } from "./tool-rail";
import { exportTool, ToolProvider, tools, useTool } from "./tools";

/**
 * A View replaces the canvas and its controls; otherwise the tool's Canvas joins the shared canvas.
 * Its Options go in the bar over the canvas on desktop and in the dock on mobile, where the output
 * histogram floats over the canvas instead of heading the sidebar.
 */
function ToolView() {
  const { tool, setTool } = useTool();
  const desktop = useDesktopLayout();
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
    <EditorLayout
      canvas={
        <EditorViewport size={size}>
          <ViewportStage>
            <Image original="originalImage" />
            {"Canvas" in tool && <tool.Canvas key={tool.id} />}
          </ViewportStage>
          <ComparisonDivider />
          <CanvasToolbar>
            {desktop && "Options" in tool && <tool.Options />}
          </CanvasToolbar>
          {!desktop && <ImageHistogram placement="canvas" />}
          <MaskOverlaySync />
        </EditorViewport>
      }
      panel={<EditorSidebar />}
      dock={<DockPanel />}
    />
  );
}

function ExportButton() {
  const { tool, setTool } = useTool();
  const exporting = tool === exportTool;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="sm"
            aria-pressed={exporting}
            className="ml-1 aria-pressed:bg-raised-hover pointer-coarse:h-8"
            onClick={() => setTool(exporting ? tools[0] : exportTool)}
          >
            Export
          </Button>
        }
      />
      <TooltipContent shortcut="E">
        Export the photo or save a scene
      </TooltipContent>
    </Tooltip>
  );
}

/** Mask creation and the tool that draws a shape are wired here, where features meet the rail. */
function MaskTools({ children }: { children: ReactNode }) {
  const document = useDocument();
  const { setTool } = useTool();
  const brush = useBrushTool();
  // A mask from the rail goes on top of the stack; one chosen from a mask's Add or Subtract menu goes inside it.
  function addMask(mask: Mask, nesting: Nesting) {
    const layer = createMask(mask, nesting.operation);
    if (nesting.parentId) {
      addLayer(document, layer, { inside: nesting.parentId });
      return;
    }
    addLayer(document, layer);
  }
  return (
    <MaskToolProvider
      onCreate={addMask}
      onTool={(shape) => {
        if (shape === "brush") {
          brush.update({ mode: "mask" });
        }
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

type ReadyState = Extract<
  ReturnType<Workspace["state"]["getState"]>,
  { status: "ready" }
>;

function DocumentEditor({
  state,
  onOpen,
  onDismissFailure,
}: {
  state: ReadyState;
  onOpen: (files: File[]) => void;
  onDismissFailure: () => void;
}) {
  return (
    <BrushProvider>
      <ToolProvider>
        <MaskTools>
          <HealingTools>
            <EditorHeader
              file={state.file}
              open={<OpenButton onOpen={onOpen} />}
            >
              <HistoryControls />
              <hr
                aria-orientation="vertical"
                className="mx-1 h-4 w-px border-0 separator"
              />
              <ComparisonControl />
              <ExportButton />
            </EditorHeader>
            <OpenContext value={onOpen}>
              <DockProvider>
                <EditorFrame rail={<ToolRail />} tabs={<DockTabs />}>
                  <ToolView />
                </EditorFrame>
              </DockProvider>
            </OpenContext>
            <OpenStatus
              opening={state.opening}
              failure={state.failure}
              onDismiss={onDismissFailure}
            />
            <PaintSettling />
            <BrushKeys />
          </HealingTools>
        </MaskTools>
      </ToolProvider>
    </BrushProvider>
  );
}

type EditorProps = {
  state: ReturnType<Workspace["state"]["getState"]>;
  onOpen: (files: File[]) => void;
  onDismissFailure: () => void;
  draft?: Recovery;
};
function EditorContent({
  state,
  onOpen,
  onDismissFailure,
  draft,
}: EditorProps) {
  if (state.status !== "ready") {
    return <EmptyEditor state={state} onOpen={onOpen} draft={draft} />;
  }
  return (
    <DocumentProvider key={state.document.id} value={state.document}>
      <RendererProvider createRenderer={createEditorRenderer}>
        <DocumentEditor
          state={state}
          onOpen={onOpen}
          onDismissFailure={onDismissFailure}
        />
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
