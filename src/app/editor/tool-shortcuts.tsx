import { useBrushTool } from "@/components/editor/brush-tool";
import type { HealMode } from "@/core/document";
import { useHealing } from "@/features/heal/mode";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type Tool, tools, useTool } from "./tools";

function nextHealingMode(mode: HealMode): HealMode {
  if (mode === "heal") return "clone";
  if (mode === "clone") return "remove";
  return "heal";
}

/** A group's key restores its last mode; pressing it while active cycles its modes. */
export function ToolShortcuts() {
  const { tool, setTool } = useTool();
  const brush = useBrushTool();
  const healing = useHealing();
  const cycles = new Map<Tool["id"], () => void>([
    [
      "brush",
      () =>
        brush.update({
          mode: brush.settings.mode === "color" ? "mask" : "color",
        }),
    ],
    ["heal", () => healing.selectMode(nextHealingMode(healing.mode))],
  ]);
  function select(entry: Tool) {
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
