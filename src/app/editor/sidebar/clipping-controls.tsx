import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";
import Button from "@/components/ui/button";

export function ClippingControls() {
	const { preview } = useDocument();
	const state = useStore(preview);
	return (
		<div className="pointer-events-none absolute inset-x-1 top-1 z-10 flex justify-between">
			{(["shadows", "highlights"] as const).map((range) => (
				<Button
					key={range}
					variant="ghost"
					aria-label={`Show clipped ${range}`}
					title={`Show clipped ${range}`}
					aria-pressed={state[range]}
					className="pointer-events-auto flex size-6 items-center justify-center rounded-sm bg-neutral-900/80 p-0 aria-pressed:bg-neutral-700 aria-pressed:text-white"
					onClick={() => preview.setState({ [range]: !state[range] })}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 12 12"
						className="size-3"
						fill="currentColor"
					>
						<path d="M6 2 11 10H1Z" />
					</svg>
				</Button>
			))}
		</div>
	);
}
