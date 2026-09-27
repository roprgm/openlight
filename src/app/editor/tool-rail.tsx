import { Tab, TabList, Tabs } from "@roprgm/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { GithubIcon } from "@/components/icons/github";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type Tool, tools, useTool } from "./tools";

/** Icon tabs in a column at the window's left edge on desktop, a bar above the canvas on mobile; tooltips carry the label and shortcut. Without a handler the tabs are inert. */
export function ToolTabList({
  selected,
  onSelect,
}: {
  selected: Tool;
  onSelect?: (tool: Tool) => void;
}) {
  const editing = tools.filter((entry) => entry.group === "edit");
  return (
    <Tabs
      value={selected}
      onValueChange={onSelect}
      className="flex shrink-0 gap-1 overflow-auto border-edge border-b surface-card shadow-none! p-1.5 md:w-11 md:flex-col md:border-r md:border-b-0"
    >
      <TabList aria-label="Tools" className="md:flex-col">
        {editing.map((entry) => (
          <Tooltip key={entry.id}>
            <TooltipTrigger
              render={
                <Tab
                  value={entry}
                  disabled={!onSelect}
                  size="icon-lg"
                  aria-label={entry.label}
                />
              }
            >
              <entry.Icon className="size-5" />
            </TooltipTrigger>
            <TooltipContent side="right" shortcut={entry.key.toUpperCase()}>
              {entry.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </TabList>
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href="https://github.com/roprgm/openlight"
              target="_blank"
              rel="noreferrer"
              aria-label="OpenLight on GitHub"
              className="ml-auto grid place-items-center rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-foreground md:mt-auto md:ml-0"
            />
          }
        >
          <GithubIcon className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="right">OpenLight on GitHub</TooltipContent>
      </Tooltip>
    </Tabs>
  );
}

export function ToolRail() {
  const { tool, setTool } = useTool();
  useShortcuts(
    Object.fromEntries(
      tools.map((entry) => [entry.key, () => setTool(entry)] as const),
    ),
  );
  return <ToolTabList selected={tool} onSelect={setTool} />;
}
