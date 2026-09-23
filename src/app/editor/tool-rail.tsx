import { GithubIcon } from "@/components/icons/github";
import { Tab, TabList } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
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
    <div className="flex shrink-0 gap-1 overflow-auto border-black border-b bg-panel p-1.5 md:w-11 md:flex-col md:border-r md:border-b-0">
      <TabList aria-label="Tools" className="md:flex-col">
        {editing.map((entry) => (
          <Tooltip
            key={entry.id}
            content={entry.label}
            shortcut={entry.key.toUpperCase()}
            side="right"
          >
            <Tab
              selected={entry === selected}
              disabled={!onSelect}
              size="icon"
              aria-label={entry.label}
              onClick={() => onSelect?.(entry)}
            >
              <entry.Icon className="size-5" />
            </Tab>
          </Tooltip>
        ))}
      </TabList>
      <Tooltip content="OpenLight on GitHub" side="right">
        <a
          href="https://github.com/roprgm/openlight"
          target="_blank"
          rel="noreferrer"
          aria-label="OpenLight on GitHub"
          className="ml-auto grid place-items-center rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-700/50 hover:text-neutral-100 md:mt-auto md:ml-0"
        >
          <GithubIcon className="size-5" />
        </a>
      </Tooltip>
    </div>
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
