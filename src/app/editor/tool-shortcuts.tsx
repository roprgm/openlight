import { useBrushTool } from "@/components/editor/brush-tool";
import { useDocument } from "@/components/editor/session";
import { findLayer } from "@/core/document";
import { useHealing } from "@/features/heal/mode";
import { nextHealMode } from "@/features/heal/modes";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type Tool, tools, useTool } from "./tools";

/** A group's key restores its last mode; pressing it while active cycles its modes. */
export function ToolShortcuts() {
  const { tool, setTool } = useTool();
  const brush = useBrushTool();
  const healing = useHealing();
  const document = useDocument();
  const cycles = new Map<Tool["id"], () => void>([
    [
      "brush",
      () =>
        brush.update({
          mode: brush.settings.mode === "color" ? "mask" : "color",
        }),
    ],
    ["heal", () => healing.selectMode(nextHealMode(healing.mode))],
  ]);
  function select(entry: Tool) {
    if (entry.id === "color-range") {
      const selected = document.selection.getState().layerId;
      const layer = findLayer(document.scene.getState().layers, selected);
      if (layer?.kind !== "mask" || layer.mask.kind !== "color-range") return;
    }
    const cycle = cycles.get(entry.id);
    if (entry === tool && cycle) {
      cycle();
      return;
    }
    setTool(entry);
  }
  useShortcuts(
    Object.fromEntries(tools.map((entry) => [entry.key, () => select(entry)])),
  );
  return null;
}
