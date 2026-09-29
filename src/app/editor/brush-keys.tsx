import { flowAt, useBrushTool } from "@/components/editor/brush-tool";
import { useDocument } from "@/components/editor/session";
import { findLayer } from "@/core/document";
import { setLayer } from "@/features/layers/edits";
import { usePaintColors } from "@/features/paint/colors";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useTool } from "./tools";

/** Digits as Photoshop reads them: 1 is 10%, 9 is 90%, and 0 is 100%. */
const digits = Array.from({ length: 10 }, (_, digit) => ({
  key: `${digit}`,
  share: (digit || 10) / 10,
}));

/**
 * Photoshop's keys for the brush and its colors. X swaps the colors, or paint and erase while the
 * Brush paints a mask; D resets them; I picks one. On the Brush, a digit sets the flow, and Shift with
 * it the selected layer's opacity.
 */
export function BrushKeys() {
  const document = useDocument();
  const { tool } = useTool();
  const brush = useBrushTool();
  const colors = usePaintColors();
  const brushing = tool.id === "brush";
  function swap() {
    if (brushing && brush.settings.mode === "mask") {
      brush.update({ erase: !brush.settings.erase });
      return;
    }
    colors.swap();
  }
  function setOpacity(opacity: number) {
    const { layerId } = document.selection.getState();
    if (
      findLayer(document.scene.getState().layers, layerId)?.kind !== "image"
    ) {
      setLayer(document, layerId, { opacity });
    }
  }
  const levels = brushing
    ? digits.flatMap(({ key, share }) => [
        [key, () => brush.update({ flow: flowAt(share) })] as const,
        [`shift+${key}`, () => setOpacity(share)] as const,
      ])
    : [];
  useShortcuts({
    x: swap,
    d: colors.reset,
    ...(colors.pick && { i: colors.pick }),
    ...Object.fromEntries(levels),
  });
  return null;
}
