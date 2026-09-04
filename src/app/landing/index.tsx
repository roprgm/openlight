import { useRef } from "react";
import Button from "@/components/ui/button";
import { accept } from "@/lib/decode";
import Backdrop from "./backdrop";

type OpenProps = { onOpen: (files: File[]) => void };

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
				multiple
				onChange={(event) => {
					const files = event.currentTarget.files;
					if (files?.length) {
						onOpen(Array.from(files));
					}
				}}
				ref={input}
				type="file"
			/>
		</>
	);
}

export default function Landing({ onOpen }: OpenProps) {
	return (
		<main className="relative isolate grid h-full place-content-center justify-items-center gap-3 bg-[radial-gradient(circle,#292929,#131313_55%)]">
			<Backdrop />
			<img alt="" className="w-16" height="64" src="/logo.svg" width="64" />
			<h1 className="text-2xl font-bold">OpenLight</h1>
			<p className="text-neutral-400">Edit photos in your browser.</p>
			<OpenImage onOpen={onOpen} />
		</main>
	);
}
