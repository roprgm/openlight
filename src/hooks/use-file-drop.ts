import { useEffect } from "react";

export function useFileDrop(onFiles: (files: File[]) => void) {
	useEffect(() => {
		const controller = new AbortController();
		const { signal } = controller;
		const preventDefault = (event: DragEvent) => event.preventDefault();
		const drop = (event: DragEvent) => {
			event.preventDefault();
			const files = event.dataTransfer?.files;
			if (files?.length) {
				onFiles(Array.from(files));
			}
		};
		document.addEventListener("dragover", preventDefault, { signal });
		document.addEventListener("drop", drop, { signal });
		return () => controller.abort();
	}, [onFiles]);
}
