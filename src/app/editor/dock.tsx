import { Tab, TabList, Tabs } from "@roprgm/ui/tabs";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useDocument } from "@/components/editor/session";
import { Density } from "@/components/editor/toolbar-density";
import { LayersIcon } from "@/components/icons/layers";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { AdjustDock } from "./adjust";
import { EditorLayers } from "./sidebar";
import { type Tool, tools, useTool } from "./tools";

/** Whether the dock shows the layer stack; the sidebar always does, so only the mobile layout reads it. */
const Stack = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function useStack() {
  const stack = useContext(Stack);
  if (!stack) {
    throw new Error("A dock provider is required.");
  }
  return stack;
}

export function DockProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Stack value={{ open, setOpen }}>{children}</Stack>;
}

type DockTab = Tool | "layers";

/**
 * The mobile layout's tabs under the dock: Layers, then the rail's tools, each its icon over its
 * name. Without a handler the tabs are inert.
 */
export function DockTabList({
  selected,
  onSelect,
}: {
  selected: DockTab;
  onSelect?: (tab: DockTab) => void;
}) {
  const editing = tools.filter((entry) => entry.group === "edit");
  const tab = "h-13 min-w-12 flex-1 flex-col gap-0.5 px-2";
  return (
    <Tabs value={selected} onValueChange={onSelect} className="surface-panel">
      <TabList
        aria-label="Tools"
        className="gap-0.5 overflow-x-auto px-2 py-1.5 shadow-[inset_0_1px_0_var(--color-edge)] [scrollbar-width:none]"
      >
        <Tab value="layers" disabled={!onSelect} className={tab}>
          <LayersIcon className="size-5" />
          Layers
        </Tab>
        {editing.map((entry) => (
          <Tab
            key={entry.id}
            value={entry}
            disabled={!onSelect}
            aria-label={entry.label}
            className={tab}
          >
            <entry.Icon className="size-5" />
            {entry.shortLabel}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}

/** Opening the stack leaves a tool with its own view, as picking a tool closes the stack. */
export function DockTabs() {
  const { tool, setTool } = useTool();
  const { open, setOpen } = useStack();
  const view = "View" in tool;
  function select(tab: DockTab) {
    setOpen(tab === "layers");
    if (tab !== "layers") {
      setTool(tab);
    } else if (view) {
      setTool(tools[0]);
    }
  }
  return (
    <DockTabList selected={open && !view ? "layers" : tool} onSelect={select} />
  );
}

/** The shared canvas's dock: the stack, the tool's options as dials, or the selected layer's dials. */
export function DockPanel() {
  const document = useDocument();
  const gesture = useEditGesture(document.history);
  const { open } = useStack();
  const { tool } = useTool();
  if (open) {
    return <EditorLayers fill />;
  }
  if ("Options" in tool) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" {...gesture}>
        <Density value="dock">
          <tool.Options />
        </Density>
      </div>
    );
  }
  return <AdjustDock />;
}
