import { useStore } from "zustand";
import {
  type BrushMode,
  brushMode,
  useBrushTool,
} from "@/components/editor/brush-tool";
import { CanvasHint } from "@/components/editor/canvas-hint";
import { useDesktopLayout } from "@/components/editor/layout";
import { useDocument, useScene } from "@/components/editor/session";
import { findLayer } from "@/core/document";
import { BrushOptions } from "@/features/layers/brush-options";
import { BrushOverlay } from "@/features/layers/brush-overlay";
import {
  addLayer,
  brushLayerCounts,
  brushLimitNames,
  brushLimits,
} from "@/features/layers/edits";
import { useMaskTool } from "@/features/layers/mask-tool";
import { PaintColors } from "@/features/paint/colors";
import { PaintOverlay } from "@/features/paint/overlay";
import { createLayer } from "./layers";

/** The canvas that paints the mode's kind of layer, adding one when none is selected unless the photo is full. */
function ModeCanvas({ mode, full }: { mode: BrushMode; full: boolean }) {
  const document = useDocument();
  const tool = useMaskTool();
  const leave = () => tool.edit();
  if (mode === "mask") {
    return <BrushOverlay canCreate={!full} onLeave={leave} />;
  }
  return (
    <PaintOverlay
      canCreate={!full}
      create={() => addLayer(document, createLayer("paint"))}
      onLeave={leave}
      onDone={leave}
    />
  );
}

/**
 * The Brush tool paints color on a paint layer or coverage on a brush mask, whichever its mode says.
 * The mode follows the selection onto either kind, and choosing the other mode starts a layer of it.
 * A photo at its limit of layers of the mode adds none, and the canvas says why.
 */
export function BrushCanvas() {
  const document = useDocument();
  const { mode } = useBrushTool().settings;
  const full = useScene(
    (scene) => brushLayerCounts(scene.layers)[mode] >= brushLimits[mode],
  );
  const selectedId = useStore(document.selection, (state) => state.layerId);
  const selected = useScene((scene) =>
    brushMode(findLayer(scene.layers, selectedId)),
  );
  return (
    <>
      <ModeCanvas mode={mode} full={full} />
      {full && selected !== mode && (
        <CanvasHint>
          A photo holds up to {brushLimits[mode]} {brushLimitNames[mode]}:
          select one to paint on, or delete one.
        </CanvasHint>
      )}
    </>
  );
}

export function BrushToolOptions() {
  // On desktop the colors sit in the tool rail; the dock has no rail, so they follow the Color chip.
  const colors = !useDesktopLayout() && <PaintColors />;
  return <BrushOptions colors={colors} />;
}
