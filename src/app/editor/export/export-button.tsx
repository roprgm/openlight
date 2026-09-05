import { useRef } from "react";
import Button from "@/components/ui/button";
import { ExportSettings } from "./export-settings";

export function ExportButton() {
	const dialog = useRef<HTMLDialogElement>(null);
	return (
		<div className="ml-auto">
			<Button
				className="flex h-8 items-center gap-2 rounded-md px-3 py-0 text-xs"
				onClick={() => dialog.current?.showModal()}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					className="size-3.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M10 2v10m-4-4 4 4 4-4M3 12v5h14v-5" />
				</svg>
				Export
			</Button>
			<dialog
				ref={dialog}
				aria-label="Export image"
				className="m-auto w-[360px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-black bg-neutral-800 p-0 text-neutral-100 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
			>
				<ExportSettings onClose={() => dialog.current?.close()} />
			</dialog>
		</div>
	);
}
