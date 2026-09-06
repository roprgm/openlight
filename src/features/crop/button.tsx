import { CropIcon } from "@/components/icons/crop";
import Button from "@/components/ui/button";
import { useShortcuts } from "@/hooks/use-shortcuts";

export function CropButton({ onClick }: { onClick: () => void }) {
	useShortcuts({ c: onClick });
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
