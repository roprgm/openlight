import Button from "@/components/ui/button";

export function CropButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			variant="ghost"
			aria-label="Crop and rotate"
			title="Crop and rotate (C)"
			className="flex size-8 items-center justify-center rounded-md p-0"
			onClick={onClick}
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
