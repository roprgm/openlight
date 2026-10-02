import { Tab, TabList, Tabs } from "@roprgm/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import type { ReactNode } from "react";
import { GithubIcon } from "@/components/icons/github";
import { InfoIcon } from "@/components/icons/info";
import { PaintColors } from "@/features/paint/colors";
import { type Tool, tools, useTool } from "./tools";

/** Opens in a new tab, leaving the photo open. */
function RailLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            className="grid place-items-center rounded-md p-1.5 text-secondary transition-colors hover:bg-hover hover:text-foreground"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Icon tabs in a column at the window's left edge, then `children`; tooltips carry the label and
 * shortcut. Without a handler the tabs are inert.
 */
export function ToolTabList({
  selected,
  onSelect,
  children,
}: {
  selected: Tool;
  onSelect?: (tool: Tool) => void;
  children?: ReactNode;
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
      {children}
      <div className="mt-auto flex flex-col gap-1">
        <RailLink href="/about" label="About OpenLight">
          <InfoIcon className="size-5" />
        </RailLink>
        <RailLink
          href="https://github.com/roprgm/openlight"
          label="OpenLight on GitHub"
        >
          <GithubIcon className="size-5" />
        </RailLink>
      </div>
    </Tabs>
  );
}

/** The tools, then the paint colors, as Photoshop keeps them. */
export function ToolRail() {
  const { tool, setTool } = useTool();
  return (
    <ToolTabList selected={tool} onSelect={setTool}>
      <PaintColors vertical />
    </ToolTabList>
  );
}
