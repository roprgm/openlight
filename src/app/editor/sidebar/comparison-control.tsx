import { useEffect } from "react";
import { useStore } from "zustand";
import type { Preview } from "@/app/document";
import { useDocument } from "@/app/document/provider";
import Button from "@/components/ui/button";

export function ComparisonControl() {
	const { preview } = useDocument();
	const comparison = useStore(preview, (state) => state.comparison);
	useEffect(() => {
		let restore: Preview["comparison"] | undefined;
		function release() {
			if (restore === undefined) {
				return;
			}
			preview.setState({ comparison: restore });
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
			restore = preview.getState().comparison;
			preview.setState({ comparison: "original" });
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
			aria-label="Compare before and after"
			aria-pressed={comparison !== "edited"}
			title="Compare before and after (hold backslash for original)"
			className="flex size-8 items-center justify-center rounded-md p-0 aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
			onClick={() =>
				preview.setState({
					comparison: comparison === "split" ? "edited" : "split",
				})
			}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 20 20"
				className="size-5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
			>
				<path d="M10 2v16M7 5H3v10h4M13 5h4v10h-4" />
			</svg>
		</Button>
	);
}
