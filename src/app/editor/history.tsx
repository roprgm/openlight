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
		<div className="flex gap-2 px-4 pt-3">
			<Button
				variant="ghost"
				className="disabled:pointer-events-none disabled:opacity-40"
				disabled={!undoCount}
				onClick={history.undo}
			>
				Undo
			</Button>
			<Button
				variant="ghost"
				className="disabled:pointer-events-none disabled:opacity-40"
				disabled={!redoCount}
				onClick={history.redo}
			>
				Redo
			</Button>
		</div>
	);
}
