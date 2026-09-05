import { useEffect } from "react";
import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";
import Button from "@/components/ui/button";

export function BeforeControl() {
	const { preview } = useDocument();
	const original = useStore(preview, (state) => state.original);
	useEffect(() => {
		let restore: boolean | undefined;
		function release() {
			if (restore === undefined) {
				return;
			}
			preview.setState({ original: restore });
			restore = undefined;
		}
		function keyDown(event: KeyboardEvent) {
			if (
				event.code !== "Backslash" ||
				event.repeat ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey
			) {
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest(
						'input:not([type="range"]), textarea, select, [role="dialog"]',
					))
			) {
				return;
			}
			event.preventDefault();
			restore = preview.getState().original;
			preview.setState({ original: true });
		}
		function keyUp(event: KeyboardEvent) {
			if (event.code === "Backslash") {
				release();
			}
		}
		window.addEventListener("keydown", keyDown);
		window.addEventListener("keyup", keyUp);
		window.addEventListener("blur", release);
		return () => {
			window.removeEventListener("keydown", keyDown);
			window.removeEventListener("keyup", keyUp);
			window.removeEventListener("blur", release);
			release();
		};
	}, [preview]);
	return (
		<Button
			variant="ghost"
			aria-label="Show original"
			aria-pressed={original}
			title="Show original (hold backslash to compare)"
			className="h-8 rounded-md px-2 py-0 text-xs aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
			onClick={() => preview.setState({ original: !original })}
		>
			Before
		</Button>
	);
}
