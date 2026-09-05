import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useRef,
} from "react";

type Edit = { begin: () => void; commit: () => void; cancel: () => void };
type Gesture = "pointerup" | "keyup";

/** Groups pointer and repeated keyboard changes; text fields commit their own draft. */
export function useEditGesture(edit: Edit) {
	const active = useRef<Gesture | null>(null);
	function begin(end: Gesture) {
		active.current = end;
		edit.begin();
	}
	useEffect(() => {
		function finish(event: Event) {
			if (active.current !== event.type) {
				return;
			}
			active.current = null;
			edit.commit();
		}
		function cancel() {
			if (!active.current) {
				return;
			}
			active.current = null;
			edit.cancel();
		}
		const controller = new AbortController();
		const { signal } = controller;
		window.addEventListener("pointerup", finish, { signal });
		window.addEventListener("keyup", finish, { signal });
		window.addEventListener("pointercancel", cancel, { signal });
		window.addEventListener("blur", cancel, { signal });
		return () => {
			controller.abort();
			cancel();
		};
	}, [edit]);
	return {
		onPointerDownCapture(event: PointerEvent) {
			if (event.button === 0) {
				const focused = document.activeElement;
				if (
					focused instanceof HTMLInputElement &&
					focused.type === "text" &&
					focused !== event.target
				) {
					focused.blur();
				}
				begin("pointerup");
			}
		},
		onPointerMoveCapture() {
			if (active.current === "pointerup") {
				edit.begin();
			}
		},
		onKeyDownCapture(event: KeyboardEvent) {
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				active.current === "pointerup" ||
				(event.target instanceof HTMLInputElement &&
					event.target.type !== "range")
			) {
				return;
			}
			// Unused keys create no history entry; shortcuts keep their own transactions.
			begin("keyup");
		},
	};
}
