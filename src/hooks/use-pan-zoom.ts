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

function measureGesture(points: Iterable<Point>) {
	const [first, second = first] = points;
	return {
		center: [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2] as const,
		distance: Math.hypot(second[0] - first[0], second[1] - first[1]),
	};
}

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
 * Wheel/drag pans, ctrl/cmd+wheel zooms at the cursor, two pointers pinch and pan, double-click resets.
 */
export function usePanZoom(content?: Size) {
	const ref = useRef<HTMLDivElement>(null);
	const pointers = useRef(new Map<number, Point>());
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
		const observer = new ResizeObserver(() => update((view) => view));
		observer.observe(element);
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
		return () => {
			observer.disconnect();
			element.removeEventListener("wheel", wheel);
		};
	}, [update]);

	const release = (event: PointerEvent<HTMLElement>) =>
		pointers.current.delete(event.pointerId);
	const handlers = {
		onPointerDown: (event: PointerEvent<HTMLElement>) => {
			if (event.button !== 0 || pointers.current.size === 2) {
				return;
			}
			pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		onPointerMove: (event: PointerEvent<HTMLElement>) => {
			const points = pointers.current;
			if (!points.has(event.pointerId)) {
				return;
			}
			const previous = measureGesture(points.values());
			points.set(event.pointerId, [event.clientX, event.clientY]);
			const next = measureGesture(points.values());
			const { left, top, width, height } =
				event.currentTarget.getBoundingClientRect();
			const focal: Point = [
				previous.center[0] - left - width / 2,
				previous.center[1] - top - height / 2,
			];
			const ratio =
				previous.distance > 0 ? next.distance / previous.distance : 1;
			update((view) => {
				const zoomed = zoomAt(view, focal, view.zoom * ratio);
				return {
					...zoomed,
					pan: [
						zoomed.pan[0] + next.center[0] - previous.center[0],
						zoomed.pan[1] + next.center[1] - previous.center[1],
					],
				};
			});
		},
		onPointerUp: release,
		onPointerCancel: release,
		onLostPointerCapture: release,
		onDoubleClick: () => setView(fit),
	};

	return { ref, view, handlers };
}
