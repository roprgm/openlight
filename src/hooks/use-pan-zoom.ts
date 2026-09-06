import {
	type PointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { View } from "@/lib/image-display";

type Size = readonly [number, number, ...unknown[]];
type Point = readonly [number, number];

const fit: View = { zoom: 1, pan: [0, 0] };
export const createCamera = () => createStore<View>(() => fit);
export type Camera = ReturnType<typeof createCamera>;
const maxZoom = 8;

function measureGesture(points: Iterable<Point>) {
	const [first, second = first] = points;
	return {
		center: [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2] as const,
		distance: Math.hypot(second[0] - first[0], second[1] - first[1]),
	};
}

function pan(view: View, x: number, y: number): View {
	return { ...view, pan: [view.pan[0] + x, view.pan[1] + y] };
}

/** Keeps the content point under `focal` fixed while changing zoom. */
function zoomAt(view: View, focal: Point, zoom: number, minimum = 1): View {
	const ratio = Math.min(Math.max(zoom, minimum), maxZoom) / view.zoom;
	return {
		...view,
		zoom: view.zoom * ratio,
		pan: [
			focal[0] + (view.pan[0] - focal[0]) * ratio,
			focal[1] + (view.pan[1] - focal[1]) * ratio,
		],
	};
}

export function fitScale(content: Size, viewport: Size) {
	return Math.min(
		viewport[0] / content[0],
		viewport[1] / content[1],
		2 / devicePixelRatio,
	);
}

/** Axes smaller than the viewport stay centered; larger ones cannot pan past their edge. */
function clamp(view: View, content: Size, viewport: Size): View {
	const scale = fitScale(content, viewport) * view.zoom;
	const axis = (i: 0 | 1) => {
		const room = Math.max(0, (content[i] * scale - viewport[i]) / 2);
		return Math.min(room, Math.max(-room, view.pan[i]));
	};
	return {
		zoom: view.zoom,
		pan: [axis(0), axis(1)],
	};
}

/**
 * Pan and zoom over `content` inside the element given `ref`.
 * Zoom 1 is the initial fit: contain, but capped at 200%. `pan` is in CSS px from the viewport center.
 * Wheel/drag pans, ctrl/cmd+wheel zooms at the cursor, two pointers pinch and pan, double-click resets.
 */
export function usePanZoom(
	state: Camera,
	content: Size,
	{ constrain = true } = {},
) {
	const ref = useRef<HTMLDivElement>(null);
	const pointers = useRef(new Map<number, Point>());
	const boundedDrag = useRef(true);
	const fitZoom = useRef(1);
	const view = useStore(state);
	const [viewport, setViewport] = useState<Point>([0, 0]);
	const [panMode, setPanMode] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		const { signal } = controller;
		function keyDown(event: KeyboardEvent) {
			if (
				event.code !== "Space" ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			) {
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest(
						'input:not([type="range"]), textarea, select, dialog, [role="dialog"]',
					))
			) {
				return;
			}
			event.preventDefault();
			setPanMode(true);
		}
		function keyUp(event: KeyboardEvent) {
			if (event.code === "Space") {
				setPanMode(false);
			}
		}
		function blur() {
			setPanMode(false);
			pointers.current.clear();
		}
		window.addEventListener("keydown", keyDown, { signal });
		window.addEventListener("keyup", keyUp, { signal });
		window.addEventListener("blur", blur, { signal });
		return () => controller.abort();
	}, []);

	const update = useCallback(
		(next: (view: View) => View, bounded = constrain) => {
			const element = ref.current;
			if (element) {
				const viewport: Size = [element.clientWidth, element.clientHeight];
				state.setState((view) => {
					const result = next(view);
					return bounded ? clamp(result, content, viewport) : result;
				}, true);
			}
		},
		[state, content, constrain],
	);

	useLayoutEffect(() => update((view) => view), [update, viewport]);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}
		const measure = () => {
			setViewport([element.clientWidth, element.clientHeight]);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			const { left, top, width, height } = element.getBoundingClientRect();
			const focal: Point = [
				event.clientX - left - width / 2,
				event.clientY - top - height / 2,
			];
			update((view) => {
				if (event.ctrlKey || event.metaKey) {
					return zoomAt(
						view,
						focal,
						view.zoom * Math.exp(-event.deltaY / 100),
						constrain ? 1 : fitZoom.current * 0.1,
					);
				}
				return pan(view, -event.deltaX, -event.deltaY);
			});
		};
		element.addEventListener("wheel", wheel, { passive: false });
		return () => {
			observer.disconnect();
			element.removeEventListener("wheel", wheel);
		};
	}, [update, constrain]);

	const release = (event: PointerEvent<HTMLElement>) =>
		pointers.current.delete(event.pointerId);
	const resetView = (next = fit) => {
		fitZoom.current = next.zoom;
		state.setState(next, true);
	};
	function startDrag(event: PointerEvent<HTMLElement>) {
		if (event.button !== 0 || pointers.current.size === 2) {
			return;
		}
		if (pointers.current.size === 0) {
			boundedDrag.current = constrain && !panMode;
		}
		pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
		event.currentTarget.setPointerCapture(event.pointerId);
	}
	const handlers = {
		onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
			if (panMode && event.button === 0) {
				event.preventDefault();
				event.stopPropagation();
				startDrag(event);
			}
		},
		onPointerDown: startDrag,
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
				const zoomed = zoomAt(
					view,
					focal,
					view.zoom * ratio,
					constrain ? 1 : fitZoom.current * 0.1,
				);
				return pan(
					zoomed,
					next.center[0] - previous.center[0],
					next.center[1] - previous.center[1],
				);
			}, boundedDrag.current);
		},
		onPointerUp: release,
		onPointerCancel: release,
		onLostPointerCapture: release,
		onDoubleClick: () => resetView(),
	};

	return { ref, view, viewport, handlers, resetView, panMode };
}
