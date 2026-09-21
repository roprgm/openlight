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
    <TabList
      aria-label="Editor mode"
      className="shrink-0 overflow-auto border-black border-b bg-panel p-1.5 md:w-11 md:flex-col md:border-r md:border-b-0"
    >
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
