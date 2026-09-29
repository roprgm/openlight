import { useStore } from "zustand";
import { brushMode, useBrushTool } from "@/components/editor/brush-tool";
import { CanvasHint } from "@/components/editor/canvas-hint";
import { useDocument, useScene } from "@/components/editor/session";
import { findLayer } from "@/core/document";
import { BrushOptions } from "@/features/layers/brush-options";
import { BrushOverlay } from "@/features/layers/brush-overlay";
import {
  addLayer,
  brushLayerCounts,
  brushLimits,
} from "@/features/layers/edits";
import { useMaskTool } from "@/features/layers/mask-tool";
import { PaintColors } from "@/features/paint/colors";
import { PaintOverlay } from "@/features/paint/overlay";
import { createLayer } from "./layers";

/**
 * The Brush tool paints color on a paint layer or coverage on a brush mask, whichever its mode says.
 * The mode follows the selection onto either kind, and choosing the other mode starts a layer of it.
 * A photo at its limit of layers of the mode adds none, and the canvas says why.
 */
export function BrushCanvas() {
  const document = useDocument();
  const { settings } = useBrushTool();
  const tool = useMaskTool();
  const limit = brushLimits[settings.mode];
  const full = useScene(
    (scene) => brushLayerCounts(scene.layers)[settings.mode] >= limit,
  );
  const selectedId = useStore(document.selection, (state) => state.layerId);
  const selected = useScene((scene) =>
    brushMode(findLayer(scene.layers, selectedId)),
  );
  const leave = () => tool.edit();
  return (
    <>
      {settings.mode === "color" ? (
        <PaintOverlay
          create={
            full ? undefined : () => addLayer(document, createLayer("paint"))
          }
          onLeave={leave}
          onDone={() => tool.edit()}
        />
      ) : (
        <BrushOverlay canCreate={!full} onLeave={leave} />
      )}
      {full && selected !== settings.mode && (
        <CanvasHint>
          A photo holds up to {limit}{" "}
          {settings.mode === "color" ? "paint layers" : "brush masks"}: select
          one to paint on, or delete one.
        </CanvasHint>
      )}
    </>
  );
}

export function BrushToolOptions() {
  return <BrushOptions colors={<PaintColors />} />;
}
