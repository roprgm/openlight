import { useEffect } from "react";
import { useDocument } from "@/app/document/provider";
import Button from "@/components/ui/button";
import { beginCrop } from "./actions";

export function CropButton() {
	const document = useDocument();
	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			if (
				event.key.toLowerCase() !== "c" ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				event.repeat
			) {
				return;
			}
			if (
				event.target instanceof HTMLElement &&
				(event.target.isContentEditable ||
					event.target.closest('input, textarea, select, [role="dialog"]'))
			) {
				return;
			}
			event.preventDefault();
			beginCrop(document);
		}
		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	}, [document]);
	return (
		<Button
			variant="ghost"
			aria-label="Crop and rotate"
			title="Crop and rotate (C)"
			className="flex size-8 items-center justify-center rounded-md p-0"
			onClick={() => beginCrop(document)}
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
				<path d="M5 2v13h13M2 5h13v13" />
			</svg>
		</Button>
	);
}
