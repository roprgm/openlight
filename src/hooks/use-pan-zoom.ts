import {
	type PointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

type Size = readonly [number, number, ...unknown[]];
type Point = readonly [number, number];
/** `percent` is image px per screen px × 100: 100 is real size. */
export type View = { zoom: number; pan: Point; percent: number };

const fit: View = { zoom: 1, pan: [0, 0], percent: 0 };
const maxZoom = 8;

/** Keeps the content point under `focal` fixed while changing zoom. */
function zoomAt(view: View, focal: Point, zoom: number): View {
	const ratio = Math.min(Math.max(zoom, 1), maxZoom) / view.zoom;
	return {
		...view,
		zoom: view.zoom * ratio,
		pan: [
			focal[0] + (view.pan[0] - focal[0]) * ratio,
			focal[1] + (view.pan[1] - focal[1]) * ratio,
		],
	};
}

/** Axes smaller than the viewport stay centered; larger ones cannot pan past their edge. */
function clamp(view: View, content: Size, viewport: Size): View {
	const scale =
		Math.min(
			viewport[0] / content[0],
			viewport[1] / content[1],
			1 / devicePixelRatio,
		) * view.zoom;
	const axis = (i: 0 | 1) => {
		const room = Math.max(0, (content[i] * scale - viewport[i]) / 2);
		return Math.min(room, Math.max(-room, view.pan[i]));
	};
	return {
		zoom: view.zoom,
		pan: [axis(0), axis(1)],
		percent: scale * devicePixelRatio * 100,
	};
}

/**
 * Pan and zoom over `content` inside the element given `ref`.
 * Zoom 1 is the initial fit: contain, but no larger than real size. `pan` is in CSS px from the viewport center.
 * Wheel pans, ctrl/cmd+wheel (and pinch) zooms at the cursor, drag pans, double-click resets.
 */
export default function usePanZoom(content?: Size) {
	const ref = useRef<HTMLDivElement>(null);
	const [view, setView] = useState(fit);

	const update = useCallback(
		(next: (view: View) => View) => {
			const element = ref.current;
			if (element && content) {
				const viewport: Size = [element.clientWidth, element.clientHeight];
				setView((view) => clamp(next(view), content, viewport));
			}
		},
		[content],
	);

	useEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}
		update((view) => view);
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			const { left, top, width, height } = element.getBoundingClientRect();
			const focal: Point = [
				event.clientX - left - width / 2,
				event.clientY - top - height / 2,
			];
			update((view) =>
				event.ctrlKey || event.metaKey
					? zoomAt(view, focal, view.zoom * Math.exp(-event.deltaY / 100))
					: {
							...view,
							pan: [view.pan[0] - event.deltaX, view.pan[1] - event.deltaY],
						},
			);
		};
		element.addEventListener("wheel", wheel, { passive: false });
		return () => element.removeEventListener("wheel", wheel);
	}, [update]);

	const handlers = {
		onPointerDown: (event: PointerEvent<HTMLElement>) =>
			event.currentTarget.setPointerCapture(event.pointerId),
		onPointerMove: (event: PointerEvent<HTMLElement>) =>
			event.buttons === 1 &&
			update((view) => ({
				...view,
				pan: [view.pan[0] + event.movementX, view.pan[1] + event.movementY],
			})),
		onDoubleClick: () => setView(fit),
	};

	return { ref, view, handlers };
}
