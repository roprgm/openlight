import { useEffect } from "react";
import { CropIcon } from "@/components/icons/crop";
import Button from "@/components/ui/button";

export function CropButton({ onClick }: { onClick: () => void }) {
	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			if (
				event.key.toLowerCase() !== "c" ||
				event.isComposing ||
				event.repeat ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			) {
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest('input, textarea, select, dialog, [role="dialog"]'))
			) {
				return;
			}
			event.preventDefault();
			onClick();
		}
		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	}, [onClick]);
	return (
		<Button
			variant="ghost"
			aria-label="Crop and rotate"
			title="Crop and rotate (C)"
			className="flex size-8 items-center justify-center rounded-md p-0"
			onClick={onClick}
		>
			<CropIcon className="size-4" />
		</Button>
	);
}
