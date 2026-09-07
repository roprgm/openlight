import { useStore } from "zustand";
import { useDocument } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import Button from "@/components/ui/button";
import { useShortcuts } from "@/hooks/use-shortcuts";

export function HistoryControls() {
	const { history } = useDocument();
	const { undoCount, redoCount } = useStore(history.status);
	useShortcuts({
		"mod+z": history.undo,
		"mod+shift+z": history.redo,
		"mod+y": history.redo,
		"mod+shift+y": history.redo,
	});
	return (
		<fieldset aria-label="History" className="flex items-center gap-0.5">
			<Button
				variant="ghost"
				className="flex size-8 items-center justify-center rounded-md p-0 disabled:pointer-events-none disabled:opacity-25"
				aria-label="Undo"
				title="Undo (Ctrl/⌘ Z)"
				disabled={!undoCount}
				onClick={history.undo}
			>
				<Icon viewBox="0 0 20 20" className="size-4">
					<path d="m7 4-4 4 4 4M3 8h8a5 5 0 0 1 0 10" />
				</Icon>
			</Button>
			<Button
				variant="ghost"
				className="flex size-8 items-center justify-center rounded-md p-0 disabled:pointer-events-none disabled:opacity-25"
				aria-label="Redo"
				title="Redo (Ctrl/⌘ Shift Z)"
				disabled={!redoCount}
				onClick={history.redo}
			>
				<Icon viewBox="0 0 20 20" className="size-4">
					<path d="m13 4 4 4-4 4m4-4H9a5 5 0 0 0 0 10" />
				</Icon>
			</Button>
		</fieldset>
	);
}
