import { useRef } from "react";
import Button from "@/components/ui/button";
import ExportSettings from "./export-settings";

export default function ExportButton() {
	const dialog = useRef<HTMLDialogElement>(null);
	return (
		<section className="shrink-0 p-4">
			<Button className="w-full" onClick={() => dialog.current?.showModal()}>
				Export
			</Button>
			<dialog
				ref={dialog}
				aria-label="Export image"
				className="m-auto w-[360px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-black bg-neutral-800 p-0 text-neutral-100 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
			>
				<ExportSettings onClose={() => dialog.current?.close()} />
			</dialog>
		</section>
	);
}
