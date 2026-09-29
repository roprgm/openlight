import { useRef } from "react";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import { useBrushTool } from "@/components/editor/brush-tool";
import { useDocument } from "@/components/editor/session";
import { useToolLayer } from "@/components/editor/tool-layer";
import type { Layer, PaintLayer } from "@/core/document";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { usePaintColors } from "./colors";
import { addPaintStroke, extendPaintStroke } from "./edits";

function isPaintLayer(layer: Layer): layer is PaintLayer {
  return layer.kind === "paint";
}

/** Paints the primary color on the selected paint layer; an untouched new one disappears on leaving. */
export function PaintOverlay({
  create,
  onLeave,
  onDone,
}: {
  /** Adds a paint layer when none is selected; without it, strokes wait for a selected one. */
  create?: () => void;
  /** The selection moved off paint layers. */
  onLeave: () => void;
  onDone: () => void;
}) {
  const document = useDocument();
  const brush = useBrushTool();
  const colors = usePaintColors();
  const painting = useRef<string | undefined>(undefined);
  const selectedPaint = useToolLayer({
    accepts: isPaintLayer,
    create,
    leave: onLeave,
  });
  useShortcuts({
    x: colors.swap,
    d: colors.reset,
    ...(colors.pick && { i: colors.pick }),
  });
  return (
    <BrushCanvas
      label="Paint canvas"
      erase={brush.erase}
      onStart={(stroke) => {
        const id = selectedPaint()?.id;
        if (!id) return false;
        painting.current = id;
        addPaintStroke(document, id, { ...stroke, color: colors.primary });
        return true;
      }}
      onExtend={(points) => {
        const id = painting.current;
        if (id) {
          extendPaintStroke(document, id, points);
        }
      }}
      onDone={onDone}
    />
  );
}
