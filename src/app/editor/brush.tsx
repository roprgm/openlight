import { useRef } from "react";
import { useStore } from "zustand";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import {
  type BrushMode,
  brushMode,
  useBrushTool,
} from "@/components/editor/brush-tool";
import { CanvasHint } from "@/components/editor/canvas-hint";
import { useDesktopLayout } from "@/components/editor/layout";
import { useDocument, useScene } from "@/components/editor/session";
import { useToolLayer } from "@/components/editor/tool-layer";
import { findLayer, type Layer } from "@/core/document";
import { BrushOptions } from "@/features/layers/brush-options";
import {
  addLayer,
  brushLayerCounts,
  brushLimit,
  brushLimits,
  extendStroke,
  paintStroke,
} from "@/features/layers/edits";
import { useMaskTool } from "@/features/layers/mask-tool";
import { PaintColors } from "@/features/paint/colors";
import { addPaintStroke, extendPaintStroke } from "@/features/paint/edits";
import { createLayer } from "./layers";

/** Paints color or mask coverage on the selected layer, dropping an untouched new one on leaving. */
function BrushOverlay({ mode, full }: { mode: BrushMode; full: boolean }) {
  const document = useDocument();
  const tool = useMaskTool();
  const brush = useBrushTool();
  const painting = useRef<string | undefined>(undefined);
  const selected = useToolLayer({
    accepts: (layer: Layer): layer is Layer => brushMode(layer) === mode,
    create: full
      ? undefined
      : () => {
          if (mode === "mask") {
            tool.create({ kind: "brush", strokes: [] });
          } else {
            addLayer(document, createLayer("paint"));
          }
        },
    leave: () => tool.edit(),
    // A chosen nesting starts a new brush even over a selected one.
    fresh: mode === "mask" && tool.pending?.shape === "brush",
  });
  return (
    <BrushCanvas
      label={mode === "mask" ? "Brush canvas" : "Paint canvas"}
      erase={brush.erase}
      onStart={(stroke) => {
        const id = selected()?.id;
        if (!id) return false;
        painting.current = id;
        if (mode === "mask") {
          paintStroke(document, id, stroke);
        } else {
          addPaintStroke(document, id, {
            ...stroke,
            color: brush.settings.colors[0],
          });
        }
        return true;
      }}
      onExtend={(points) => {
        const id = painting.current;
        if (!id) return;
        const extend = mode === "mask" ? extendStroke : extendPaintStroke;
        extend(document, id, points);
      }}
      onDone={() => tool.edit()}
    />
  );
}

/**
 * The Brush tool paints color on a paint layer or coverage on a brush mask, whichever its mode says.
 * The mode follows the selection onto either kind, and choosing the other mode starts a layer of it.
 * A photo at its limit of layers of the mode adds none, and the canvas says why.
 */
export function BrushToolCanvas() {
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
      <BrushOverlay key={mode} mode={mode} full={full} />
      {full && selected !== mode && (
        <CanvasHint>
          {brushLimit(mode)}: select one to paint on, or delete one.
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
