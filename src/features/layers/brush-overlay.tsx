import { useRef } from "react";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import { useBrushTool } from "@/components/editor/brush-tool";
import { useDocument } from "@/components/editor/session";
import { useToolLayer } from "@/components/editor/tool-layer";
import type { Layer, MaskLayer } from "@/core/document";
import { extendStroke, paintStroke } from "./edits";
import { useMaskTool } from "./mask-tool";

function isBrushMask(layer: Layer): layer is MaskLayer {
  return layer.kind === "mask" && layer.mask.kind === "brush";
}

/** Keeps a brush mask selected; an untouched new mask disappears on leaving. */
export function BrushOverlay() {
  const document = useDocument();
  const tool = useMaskTool();
  const brush = useBrushTool();
  const painting = useRef<string | undefined>(undefined);
  const selectedBrush = useToolLayer({
    accepts: isBrushMask,
    create: () => tool.create({ kind: "brush", strokes: [] }),
    leave: () => tool.edit(),
    // A chosen nesting starts a new brush even over a selected one.
    fresh: tool.pending?.shape === "brush",
  });
  return (
    <BrushCanvas
      label="Brush canvas"
      erase={brush.erase}
      onStart={(stroke) => {
        const id = selectedBrush()?.id;
        if (!id) return false;
        painting.current = id;
        paintStroke(document, id, stroke);
        return true;
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
