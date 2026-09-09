import { Icon } from "@/components/icons/icon";
import Button from "@/components/ui/button";
import { useShortcuts } from "@/hooks/use-shortcuts";

export function SelectButton({ onClick }: { onClick: () => void }) {
	useShortcuts({ w: onClick });
	return (
		<Button
			variant="ghost"
			aria-label="Magic Wand"
			title="Magic Wand (W)"
			className="flex size-8 items-center justify-center rounded-md p-0"
			onClick={onClick}
		>
			<Icon viewBox="0 0 20 20" className="size-4">
				<path
					d="m3 17 10-10 3 3L6 20M11 9l3 3M5 2v4M3 4h4M15 1v4M13 3h4M16 15v4M14 17h4"
					transform="translate(0 -1)"
				/>
			</Icon>
		</Button>
	);
}
