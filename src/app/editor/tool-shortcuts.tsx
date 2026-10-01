import { useBrushTool } from "@/components/editor/brush-tool";
import { useHealing } from "@/features/heal/mode";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type Tool, tools, useTool } from "./tools";

/** A group's key enters it; pressing it again cycles its available modes. */
export function ToolShortcuts() {
  const { tool, setTool } = useTool();
  const brush = useBrushTool();
  const healing = useHealing();
  const groups = new Map<Tool["id"], { enter?: () => void; cycle: () => void }>(
    [
      [
        "brush",
        {
          cycle: () =>
            brush.update({
              mode: brush.settings.mode === "color" ? "mask" : "color",
            }),
        },
      ],
      [
        "heal",
        {
          enter: () => healing.selectMode("heal"),
          cycle: () =>
            healing.selectMode(healing.mode === "heal" ? "clone" : "heal"),
        },
      ],
    ],
  );
  function select(entry: Tool) {
    const group = groups.get(entry.id);
    if (entry === tool && group) {
      group.cycle();
      return;
    }
    group?.enter?.();
    setTool(entry);
  }
  useShortcuts(
    Object.fromEntries(tools.map((entry) => [entry.key, () => select(entry)])),
  );
  return null;
}
