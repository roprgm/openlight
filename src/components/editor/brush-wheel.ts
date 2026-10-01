import { useEffect, useEffectEvent, useRef } from "react";
import { useBrushInput } from "./brush-input";
import { useViewport } from "./viewport";

/** Handles brush sizing before the viewport's native wheel listener. */
export function useBrushWheel() {
  const ref = useRef<HTMLDivElement>(null);
  const brush = useBrushInput();
  const camera = useViewport();
  const wheel = useEffectEvent((event: WheelEvent) => {
    // Trackpad pinch is ctrl+wheel; navigation keeps that gesture and horizontal scrolling.
    if (
      event.ctrlKey ||
      event.metaKey ||
      camera.panMode ||
      !event.deltaY ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
      delta *= camera.viewport[1];
    brush.resize(Math.exp(-delta / 400));
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  return ref;
}
