import { Tab, TabList } from "@/components/ui/tabs";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { type Mode, modes, useMode } from "./modes";

function ModeTab({ entry }: { entry: Mode }) {
	const { mode, setMode } = useMode();
	return (
		<Tab
			selected={entry === mode}
			title={`${entry.label} (${entry.key.toUpperCase()})`}
			onClick={() => setMode(entry)}
			className="flex min-w-16 flex-1 flex-col items-center gap-0.5 rounded-md px-0 py-1.5 md:min-w-0 md:flex-none md:py-2"
		>
			<entry.Icon className="size-5" />
			{entry.label}
		</Tab>
	);
}

/** A column at the window's right edge on desktop, a scrollable bar below the panel on mobile. Letter shortcuts work anywhere. */
export function ModeRail() {
	const { setMode } = useMode();
	useShortcuts(
		Object.fromEntries(
			modes.map((entry) => [entry.key, () => setMode(entry)] as const),
		),
	);
	const editing = modes.filter((entry) => entry.group === "edit");
	const output = modes.filter((entry) => entry.group === "output");
	return (
		<TabList
			aria-label="Editor mode"
			className="shrink-0 overflow-auto border-black border-t bg-panel p-2 shadow-ridge md:w-17.5 md:flex-col md:border-t-0 md:border-l"
		>
			{editing.map((entry) => (
				<ModeTab key={entry.id} entry={entry} />
			))}
			<div className="my-1 w-px shrink-0 bg-black md:my-0 md:w-auto md:flex-1 md:bg-transparent" />
			{output.map((entry) => (
				<ModeTab key={entry.id} entry={entry} />
			))}
		</TabList>
	);
}
