import { useEffect } from "react";
import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";
import Button from "@/components/ui/button";

export function HistoryControls() {
	const { history } = useDocument();
	const { undoCount, redoCount } = useStore(history.status);
	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest('input:not([type="range"]), textarea, select'))
			) {
				return;
			}
			if (!(event.metaKey || event.ctrlKey) || event.altKey) {
				return;
			}
			const key = event.key.toLowerCase();
			if (key !== "z" && key !== "y") {
				return;
			}
			event.preventDefault();
			if (key === "y" || event.shiftKey) {
				history.redo();
			} else {
				history.undo();
			}
		}
		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	}, [history]);
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
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					className="size-4"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="m7 4-4 4 4 4M3 8h8a5 5 0 0 1 0 10" />
				</svg>
			</Button>
			<Button
				variant="ghost"
				className="flex size-8 items-center justify-center rounded-md p-0 disabled:pointer-events-none disabled:opacity-25"
				aria-label="Redo"
				title="Redo (Ctrl/⌘ Shift Z)"
				disabled={!redoCount}
				onClick={history.redo}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					className="size-4"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="m13 4 4 4-4 4m4-4H9a5 5 0 0 0 0 10" />
				</svg>
			</Button>
		</fieldset>
	);
}
