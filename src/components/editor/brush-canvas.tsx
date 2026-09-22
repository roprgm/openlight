import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { BrushStroke, StrokePoint } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useBrushTool } from "./brush-tool";
import { useDocumentMapping } from "./mapping";
import { useDocument } from "./session";
import { useViewport } from "./viewport";

type Stroke = {
  pointer: number;
  /** The viewport bounds measured once; pointer capture keeps them valid for the drag. */
  box: DOMRect | undefined;
  pending: StrokePoint[];
  frame?: number;
};

type PointerLike = {
  clientX: number;
  clientY: number;
  pressure: number;
  pointerType: string;
};

/** Shared pressure-aware brush input and cursor. The caller owns the scene edit. */
export function BrushCanvas({
  label,
  hint,
  erase,
  feather,
  onStart,
  onExtend,
  onComplete,
  onFinish,
  onPickSource,
  onDone,
  children,
}: {
  label: string;
  hint?: string;
  erase: boolean;
  /** Overrides the shared brush feather for tools that own their stroke softness. */
  feather?: number;
  onStart: (stroke: BrushStroke) => void;
  onExtend: (points: readonly StrokePoint[]) => void;
  onComplete?: (signal: AbortSignal) => void | Promise<void>;
  onFinish?: (committed: boolean) => void;
  onPickSource?: (point: Point) => void;
  onDone: () => void;
  children?: ReactNode;
}) {
  const document = useDocument();
  const brush = useBrushTool();
  const strokeFeather = feather ?? brush.settings.feather;
  const camera = useViewport();
  const mapping = useDocumentMapping();
  const stroke = useRef<Stroke | null>(null);
  const completing = useRef<AbortController | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [pointerVisible, setPointerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const gradient = useId();
  function point(event: PointerLike, box: DOMRect | undefined): StrokePoint {
    const [x, y] = mapping.toDocument(event.clientX, event.clientY, box);
    return [x, y, event.pointerType === "pen" ? event.pressure : 1];
  }
  /** Ends the stroke; a cancelled stroke restores the scene. */
  function finish(commit: boolean) {
    const current = stroke.current;
    if (!current) {
      if (!commit && completing.current) {
        completing.current.abort();
        document.history.cancel();
      }
      return;
    }
    stroke.current = null;
    onFinish?.(commit);
    if (current.frame !== undefined) {
      cancelAnimationFrame(current.frame);
    }
    if (commit) {
      flush(current);
      if (!onComplete) {
        document.history.commit();
        return;
      }
      setBusy(true);
      const controller = new AbortController();
      completing.current = controller;
      void Promise.resolve()
        .then(() => onComplete(controller.signal))
        .then(() => {
          if (!controller.signal.aborted) {
            document.history.commit();
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            document.history.cancel();
            setError(String(error));
          }
        })
        .finally(() => {
          if (completing.current === controller) {
            completing.current = null;
            setBusy(false);
          }
        });
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
      onExtend(points);
    } catch (error) {
      document.history.cancel();
      stroke.current = null;
      setError(String(error));
    }
  }
  useEffect(
    () => () => {
      finish(false);
      brush.setPreview(false);
    },
    [],
  );
  useEffect(() => {
    if (!brush.preview || pointer) return;
    const bounds = camera.ref.current?.getBoundingClientRect();
    if (bounds) setPointer([bounds.width / 2, bounds.height / 2]);
  }, [brush.preview, pointer, camera.ref]);
  useShortcuts({
    escape: () =>
      stroke.current || completing.current ? finish(false) : onDone(),
    enter: () => {
      if (!stroke.current && !completing.current) {
        onDone();
      }
    },
    "[": () => brush.update({ size: Math.round(brush.settings.size / 1.25) }),
    "]": () => brush.update({ size: Math.round(brush.settings.size * 1.25) }),
  });
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || camera.panMode) {
      return;
    }
    if (busy) {
      return;
    }
    const box = camera.ref.current?.getBoundingClientRect();
    const first = point(event, box);
    if (event.altKey && onPickSource) {
      onPickSource([first[0], first[1]]);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setError(undefined);
    document.history.begin();
    onStart({
      mode: erase ? "erase" : "paint",
      size: brush.settings.size,
      feather: strokeFeather,
      flow: brush.settings.flow,
      points: [first],
    });
    stroke.current = { pointer: event.pointerId, box, pending: [] };
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
    const overHandle =
      event.target instanceof Element &&
      event.target.closest("[data-hide-brush-cursor]");
    setPointerVisible(!overHandle);
    if (!overHandle) {
      setPointer([event.clientX - bounds.left, event.clientY - bounds.top]);
    }
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
  const color = erase ? "black" : "white";
  const dash = erase ? "4 3" : undefined;
  const status = error ?? (busy ? "Finishing stroke…" : hint);
  const cursor = pointerVisible || brush.preview ? pointer : null;
  return (
    <div
      role="application"
      aria-label={label}
      className="absolute inset-0 cursor-none touch-none data-[pan=true]:pointer-events-none"
      data-pan={camera.panMode}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={() => setPointerVisible(false)}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => {
        if (stroke.current) {
          finish(false);
        }
      }}
    >
      {children}
      {cursor && !camera.panMode && (
        <svg
          aria-hidden="true"
          data-brush-cursor="true"
          data-preview={brush.preview}
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <defs>
            {/* The fill previews the dab: solid inside the feather, fading to the edge. */}
            <radialGradient id={gradient} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor={color} stopOpacity="0.3" />
              <stop
                offset={1 - strokeFeather}
                stopColor={color}
                stopOpacity="0.3"
              />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            cx={cursor[0]}
            cy={cursor[1]}
            r={Math.max(2, radius)}
            fill={`url(#${gradient})`}
            stroke="white"
            strokeOpacity="0.9"
            strokeDasharray={dash}
          />
          <circle
            cx={cursor[0]}
            cy={cursor[1]}
            r={Math.max(2, radius)}
            fill="none"
            stroke="black"
            strokeOpacity="0.5"
            strokeWidth="3"
            strokeDasharray={dash}
            style={{ paintOrder: "stroke" }}
          />
        </svg>
      )}
      {status && (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-neutral-800/80 px-3 py-1.5 text-white backdrop-blur-sm">
          {status}
        </p>
      )}
    </div>
  );
}
