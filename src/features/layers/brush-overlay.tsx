import { useEffect, useRef } from "react";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import { useBrushTool } from "@/components/editor/brush-tool";
import { useDocument } from "@/components/editor/session";
import { findLayer } from "@/core/document";
import { extendStroke, paintStroke } from "./edits";
import { useMaskTool } from "./mask-tool";

/** Keeps a brush mask selected; an untouched new mask disappears on leaving. */
export function BrushOverlay() {
  const document = useDocument();
  const tool = useMaskTool();
  const brush = useBrushTool();
  const painting = useRef<string | undefined>(undefined);
  function selectedBrush() {
    const layer = findLayer(
      document.scene.getState().layers,
      document.selection.getState().layerId,
    );
    return layer?.kind === "mask" && layer.mask.kind === "brush"
      ? layer.id
      : undefined;
  }
  useEffect(() => {
    // A chosen nesting starts a new brush even over a selected one.
    const before =
      tool.pending?.shape === "brush" || !selectedBrush()
        ? document.scene.getState()
        : undefined;
    if (before) {
      tool.create({ kind: "brush", strokes: [] });
    }
    const unsubscribe = document.selection.subscribe(() => {
      if (!selectedBrush()) {
        tool.edit();
      }
    });
    return () => {
      unsubscribe();
      // The new mask leaves with the tool unless anything happened after its creation.
      if (before) {
        document.history.drop(before);
      }
    };
  }, []);
  return (
    <BrushCanvas
      label="Brush canvas"
      hint="Drag to paint · Alt erases · [ ] resize · Enter when done"
      erase={brush.erase}
      onStart={(stroke) => {
        const id = selectedBrush();
        if (id) {
          painting.current = id;
          paintStroke(document, id, stroke);
        }
      }}
      onExtend={(points) => {
        const id = painting.current;
        if (id) {
          extendStroke(document, id, points);
        }
      }}
      onDone={() => tool.edit()}
    />
  );
}
