import { type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { findLayer, type StrokePoint } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useBrushTool } from "./brush-tool";
import { extendStroke, paintStroke } from "./edits";
import { useMaskTool } from "./mask-tool";

type Stroke = {
  pointer: number;
  /** The viewport bounds measured once; pointer capture keeps them valid for the drag. */
  box: DOMRect | undefined;
  id: string;
  pending: StrokePoint[];
  frame?: number;
};

type PointerLike = {
  clientX: number;
  clientY: number;
  pressure: number;
  pointerType: string;
};

/**
 * Paints into the selected brush mask, which the tool keeps selected: choosing the tool creates that
 * mask at once, so adjustments before the first stroke belong to it, and leaving with it untouched
 * removes it and its history entry. Once the selection is no longer a brush mask, the tool leaves.
 */
export function BrushOverlay() {
  const document = useDocument();
  const tool = useMaskTool();
  const brush = useBrushTool();
  const camera = useViewport();
  const mapping = useDocumentMapping();
  const stroke = useRef<Stroke | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const { erase } = brush;
  const gradient = useId();
  function selectedBrush() {
    const layer = findLayer(
      document.scene.getState().layers,
      document.selection.getState().layerId,
    );
    return layer?.kind === "mask" && layer.mask.kind === "brush"
      ? layer.id
      : undefined;
  }
  function point(event: PointerLike, box: DOMRect | undefined): StrokePoint {
    const [x, y] = mapping.toDocument(event.clientX, event.clientY, box);
    return [x, y, event.pointerType === "pen" ? event.pressure : 1];
  }
  /** Ends the stroke; a cancelled stroke restores the scene. */
  function finish(commit: boolean) {
    const current = stroke.current;
    if (!current) {
      return;
    }
    stroke.current = null;
    if (current.frame !== undefined) {
      cancelAnimationFrame(current.frame);
    }
    if (commit) {
      flush(current);
      document.history.commit();
      return;
    }
    document.history.cancel();
  }
  function flush(current: Stroke) {
    current.frame = undefined;
    if (!current.pending.length) {
      return;
    }
    const points = current.pending;
    current.pending = [];
    try {
      extendStroke(document, current.id, points);
    } catch {
      finish(false);
    }
  }
  useEffect(() => () => finish(false), []);
  useEffect(() => {
    // A chosen nesting starts a new brush even over a selected one.
    const before =
      tool.pending?.shape === "brush" || !selectedBrush()
        ? document.scene.getState()
        : undefined;
    if (before) {
      tool.create({ kind: "brush", strokes: [] });
    }
    const unsubscribe = document.selection.subscribe(() => {
      if (!selectedBrush()) {
        tool.edit();
      }
    });
    return () => {
      unsubscribe();
      // The new mask leaves with the tool unless anything happened after its creation.
      if (before) {
        document.history.drop(before);
      }
    };
  }, []);
  useShortcuts({
    escape: () => (stroke.current ? finish(false) : tool.edit()),
    enter: () => {
      if (!stroke.current) {
        tool.edit();
      }
    },
    "[": () => brush.update({ size: Math.round(brush.settings.size / 1.25) }),
    "]": () => brush.update({ size: Math.round(brush.settings.size * 1.25) }),
  });
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || camera.panMode) {
      return;
    }
    const id = selectedBrush();
    if (!id) {
      return;
    }
    const box = camera.ref.current?.getBoundingClientRect();
    document.history.begin();
    paintStroke(document, id, {
      mode: erase ? "erase" : "paint",
      size: brush.settings.size,
      feather: brush.settings.feather,
      flow: brush.settings.flow,
      points: [point(event, box)],
    });
    stroke.current = { pointer: event.pointerId, box, id, pending: [] };
    // The viewport below would otherwise capture the pointer to pan.
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (window.document.activeElement instanceof HTMLElement) {
      window.document.activeElement.blur();
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setPointer([event.clientX - bounds.left, event.clientY - bounds.top]);
    const current = stroke.current;
    if (!current || current.pointer !== event.pointerId) {
      return;
    }
    const native = event.nativeEvent;
    const events = native.getCoalescedEvents?.() ?? [];
    for (const item of events.length ? events : [native]) {
      current.pending.push(point(item, current.box));
    }
    // One edit per frame keeps the queue from outrunning the display.
    current.frame ??= requestAnimationFrame(() => flush(current));
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    const current = stroke.current;
    if (!current || current.pointer !== event.pointerId) {
      return;
    }
    finish(true);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const radius = brush.settings.size / 2 / mapping.pixelsPerViewportPixel;
  return (
    <div
      role="application"
      aria-label="Brush canvas"
      className="absolute inset-0 cursor-none touch-none data-[pan=true]:pointer-events-none"
      data-pan={camera.panMode}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={() => setPointer(null)}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => finish(false)}
    >
      {pointer && !camera.panMode && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <defs>
            {/* The fill previews the dab: solid inside the feather, fading to the edge. */}
            <radialGradient id={gradient} cx="0.5" cy="0.5" r="0.5">
              <stop
                offset="0"
                stopColor={erase ? "black" : "white"}
                stopOpacity="0.3"
              />
              <stop
                offset={1 - brush.settings.feather}
                stopColor={erase ? "black" : "white"}
                stopOpacity="0.3"
              />
              <stop
                offset="1"
                stopColor={erase ? "black" : "white"}
                stopOpacity="0"
              />
            </radialGradient>
          </defs>
          <circle
            cx={pointer[0]}
            cy={pointer[1]}
            r={Math.max(2, radius)}
            fill={`url(#${gradient})`}
            stroke="white"
            strokeOpacity="0.9"
            strokeDasharray={erase ? "4 3" : undefined}
          />
          <circle
            cx={pointer[0]}
            cy={pointer[1]}
            r={Math.max(2, radius)}
            fill="none"
            stroke="black"
            strokeOpacity="0.5"
            strokeWidth="3"
            strokeDasharray={erase ? "4 3" : undefined}
            style={{ paintOrder: "stroke" }}
          />
        </svg>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-neutral-800/80 px-3 py-1.5 text-white backdrop-blur-sm">
        Drag to paint · Alt erases · [ ] resize · Enter when done
      </p>
    </div>
  );
}
