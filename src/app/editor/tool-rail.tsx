import { Tab, TabList, Tabs } from "@roprgm/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { GithubIcon } from "@/components/icons/github";
import { type Tool, tools, useTool } from "./tools";

/** Icon tabs in a column at the window's left edge; tooltips carry the label and shortcut. Without a handler the tabs are inert. */
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
      className="flex w-11 shrink-0 flex-col gap-1 overflow-auto border-edge border-r surface-panel p-1.5"
    >
      <TabList aria-label="Tools" className="flex-col">
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
              className="mt-auto grid place-items-center rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-foreground"
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
  return <ToolTabList selected={tool} onSelect={setTool} />;
}
