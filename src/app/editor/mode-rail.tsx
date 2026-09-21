import { GithubIcon } from "@/components/icons/github";
import { Tab, TabList } from "@/components/ui/tabs";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type Mode, modes, useMode } from "./modes";

/** Icon tabs in a column at the window's left edge on desktop, a bar above the canvas on mobile; titles carry the label and shortcut. Without a handler the tabs are inert. */
export function ModeTabList({
  selected,
  onSelect,
}: {
  selected: Mode;
  onSelect?: (mode: Mode) => void;
}) {
  const editing = modes.filter((entry) => entry.group === "edit");
  return (
    <div className="flex shrink-0 gap-1 overflow-auto border-black border-b bg-panel p-1.5 md:w-11 md:flex-col md:border-r md:border-b-0">
      <TabList aria-label="Editor mode" className="md:flex-col">
        {editing.map((entry) => (
          <Tab
            key={entry.id}
            selected={entry === selected}
            disabled={!onSelect}
            size="icon"
            className="disabled:pointer-events-none disabled:opacity-40"
            aria-label={entry.label}
            title={`${entry.label} (${entry.key.toUpperCase()})`}
            onClick={() => onSelect?.(entry)}
          >
            <entry.Icon className="size-5" />
          </Tab>
        ))}
      </TabList>
      <a
        href="https://github.com/roprgm/openlight"
        target="_blank"
        rel="noreferrer"
        aria-label="OpenLight on GitHub"
        title="OpenLight on GitHub"
        className="ml-auto grid place-items-center rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-700/50 hover:text-neutral-100 md:mt-auto md:ml-0"
      >
        <GithubIcon className="size-5" />
      </a>
    </div>
  );
}

export function ModeRail() {
  const { mode, setMode } = useMode();
  useShortcuts(
    Object.fromEntries(
      modes.map((entry) => [entry.key, () => setMode(entry)] as const),
    ),
  );
  return <ModeTabList selected={mode} onSelect={setMode} />;
}
