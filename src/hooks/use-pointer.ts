import { useEffect, useRef } from "react";

type Mode = "none" | "hover" | "drag";
type Pointer = { x: number; y: number; mode: Mode };

/** Where the mouse or a dragged file last was, as fractions of the viewport. */
export default function usePointer() {
	const pointer = useRef<Pointer>({ x: 0, y: 0, mode: "none" });

	useEffect(() => {
		const controller = new AbortController();
		const { signal } = controller;
		const track =
			(mode: Mode) =>
			({ clientX, clientY }: MouseEvent) => {
				pointer.current = {
					x: clientX / innerWidth,
					y: clientY / innerHeight,
					mode,
				};
			};
		document.addEventListener("pointermove", track("hover"), { signal });
		document.addEventListener("pointerleave", track("none"), { signal });
		document.addEventListener("dragover", track("drag"), { signal });
		document.addEventListener("dragleave", track("none"), { signal });
		document.addEventListener("drop", track("none"), { signal });
		return () => controller.abort();
	}, []);

	return pointer;
}
