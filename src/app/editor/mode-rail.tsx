import { Tab, TabList } from "@/components/ui/tabs";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type Mode, modes, useMode } from "./modes";

function ModeTab({ entry }: { entry: Mode }) {
	const { mode, setMode } = useMode();
	return (
		<Tab
			selected={entry === mode}
			size="icon"
			aria-label={entry.label}
			title={`${entry.label} (${entry.key.toUpperCase()})`}
			onClick={() => setMode(entry)}
		>
			<entry.Icon className="size-5" />
		</Tab>
	);
}

/** Icon tabs in a column at the window's left edge on desktop, a bar above the canvas on mobile; titles carry the label and shortcut. */
export function ModeRail() {
	const { setMode } = useMode();
	useShortcuts(
		Object.fromEntries(
			modes.map((entry) => [entry.key, () => setMode(entry)] as const),
		),
	);
	const editing = modes.filter((entry) => entry.group === "edit");
	return (
		<TabList
			aria-label="Editor mode"
			className="shrink-0 overflow-auto border-black border-b bg-panel p-1.5 md:w-11 md:flex-col md:border-r md:border-b-0"
		>
			{editing.map((entry) => (
				<ModeTab key={entry.id} entry={entry} />
			))}
		</TabList>
	);
}
