import { type DragEvent, useRef } from "react";
import Button from "@/components/ui/button";
import { accept, canDecode } from "@/lib/decode";
import Backdrop from "./backdrop";

type OpenProps = { onOpen: (files: FileList | null) => void };

function OpenImage({ onOpen }: OpenProps) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<>
			<Button className="mt-3" onClick={() => input.current?.click()}>
				Open image
			</Button>
			<input
				accept={accept}
				hidden
				onChange={(event) => onOpen(event.currentTarget.files)}
				ref={input}
				type="file"
			/>
		</>
	);
}

type LandingProps = { onOpen: (image: File) => void };

export default function Landing({ onOpen }: LandingProps) {
	const open = (files: FileList | null) => {
		const image = files?.[0];
		if (image && canDecode(image)) {
			onOpen(image);
		}
	};
	const drop = (event: DragEvent) => {
		event.preventDefault();
		open(event.dataTransfer.files);
	};

	return (
		<main
			className="relative isolate grid h-full place-content-center justify-items-center gap-3 bg-[radial-gradient(circle,#292929,#131313_55%)]"
			onDragOver={(event) => event.preventDefault()}
			onDrop={drop}
		>
			<Backdrop />
			<img alt="" className="w-16" height="64" src="/logo.svg" width="64" />
			<h1 className="text-2xl font-bold">OpenLight</h1>
			<p className="text-neutral-400">Edit locally in your browser.</p>
			<OpenImage onOpen={open} />
		</main>
	);
}
