import { Popover, PopoverContent, PopoverTrigger } from "@roprgm/ui/popover";
import { Section } from "@roprgm/ui/section";
import { Slider } from "@roprgm/ui/slider";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { BrushStroke, StrokePoint } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { blurActive, containsTarget } from "@/lib/dom";
import { BrushCursor } from "./brush-cursor";
import { useBrushInput } from "./brush-input";
import { useBrushWheel } from "./brush-wheel";
import { CanvasHint } from "./canvas-hint";
import { useDocumentMapping } from "./mapping";
import { useDocument } from "./session";
import { useViewport } from "./viewport";

type Stroke = {
  pointer: number;
  touch: boolean;
  /** The last screen position, handed to the viewport when a second finger turns the stroke into a pinch. */
  client: Point;
  /** The viewport bounds measured once; pointer capture keeps them valid for the drag. */
  box: DOMRect;
  /** The last sample in viewport pixels, where the path to the next one starts. */
  last: Point;
  pending: StrokePoint[];
  editOnRelease: boolean;
  frame?: number;
};

type PointerLike = {
  clientX: number;
  clientY: number;
  pressure: number;
  pointerType: string;
};

export type BrushModifiers = { shift: boolean; alt: boolean };

/** Shared pressure-aware brush input and cursor. The caller owns the scene edit. */
export function BrushCanvas({
  label,
  erase,
  onStart,
  onExtend,
  editOnRelease = false,
  onComplete,
  onFinish,
  onPickSource,
  onDone,
  children,
}: {
  label: string;
  erase: boolean;
  /** Starts the first dab or preview and returns whether accepted; a declined stroke leaves nothing behind. */
  onStart: (stroke: BrushStroke, modifiers: BrushModifiers) => boolean;
  onExtend: (points: readonly StrokePoint[]) => void;
  /** Keeps a local preview outside history; onFinish records the edit on release. */
  editOnRelease?: boolean | ((modifiers: BrushModifiers) => boolean);
  onComplete?: (signal: AbortSignal) => void | Promise<void>;
  onFinish?: (committed: boolean) => void;
  onPickSource?: (point: Point) => void;
  onDone: () => void;
  children?: ReactNode;
}) {
  const document = useDocument();
  const brush = useBrushInput();
  const camera = useViewport();
  const wheelRef = useBrushWheel();
  const mapping = useDocumentMapping();
  const stroke = useRef<Stroke | null>(null);
  const completing = useRef<AbortController | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  /** The source diameter of the stroke being drawn, which the cursor shows wherever it goes. */
  const [drawn, setDrawn] = useState<number>();
  /** Where a right click opened the brush menu. */
  const [menu, setMenu] = useState<Point | null>(null);
  const [pointerVisible, setPointerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  function pressure(event: PointerLike) {
    return event.pointerType === "pen" ? event.pressure : 1;
  }
  function viewportPoint(event: PointerLike, box: DOMRect): Point {
    return [event.clientX - box.left, event.clientY - box.top];
  }
  function flush(current: Stroke) {
    current.frame = undefined;
    if (!current.pending.length) {
      return true;
    }
    const points = current.pending;
    current.pending = [];
    try {
      onExtend(points);
      return true;
    } catch (error) {
      stroke.current = null;
      setDrawn(undefined);
      onFinish?.(false);
      if (!current.editOnRelease) document.history.cancel();
      setError(String(error));
      return false;
    }
  }
  /** Ends the stroke; a cancelled stroke restores the scene. */
  function finish(commit: boolean) {
    const current = stroke.current;
    if (!current) {
      if (!commit && completing.current) {
        completing.current.abort();
        completing.current = null;
        document.history.cancel();
        setBusy(false);
      }
      return;
    }
    stroke.current = null;
    setDrawn(undefined);
    if (current.frame !== undefined) {
      cancelAnimationFrame(current.frame);
    }
    if (commit && !flush(current)) return;
    onFinish?.(commit);
    if (current.editOnRelease) return;
    if (commit) {
      if (!onComplete) {
        document.history.commit();
        return;
      }
      setBusy(true);
      const controller = new AbortController();
      completing.current = controller;
      const unsubscribe = document.history.status.subscribe(({ editing }) => {
        if (!editing) {
          controller.abort();
        }
      });
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
          unsubscribe();
          if (completing.current === controller) {
            completing.current = null;
            setBusy(false);
          }
        });
      return;
    }
    document.history.cancel();
  }
  const cancelStroke = useEffectEvent(() => finish(false));
  useEffect(() => {
    const unsubscribe = document.history.status.subscribe((state, previous) => {
      if (
        stroke.current &&
        !state.editing &&
        (previous.editing ||
          state.undoCount !== previous.undoCount ||
          state.redoCount !== previous.redoCount)
      )
        cancelStroke();
    });
    return () => {
      unsubscribe();
      cancelStroke();
      brush.setPreview(false);
    };
  }, []);
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
    "[": () => resizeBy(1 / 1.25),
    "]": () => resizeBy(1.25),
    "shift+[": () => featherBy(-0.1),
    "shift+]": () => featherBy(0.1),
  });
  function resizeBy(factor: number) {
    const rounded = Math.round(brush.settings.size * factor);
    const size =
      rounded === brush.settings.size
        ? rounded + Math.sign(factor - 1)
        : rounded;
    brush.update({ size });
  }
  function featherBy(step: number) {
    if (stroke.current) return;
    const feather = Math.round((brush.settings.feather + step) * 10) / 10;
    brush.update({ feather: Math.min(1, Math.max(0, feather)) });
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    // Portaled controls share the React tree, but their gestures belong to the UI.
    if (!containsTarget(event)) {
      event.stopPropagation();
      return;
    }
    const current = stroke.current;
    if (current?.touch && event.pointerType === "touch" && !event.isPrimary) {
      // A second finger means a pinch: drop the stroke and let the viewport take both fingers.
      finish(false);
      event.currentTarget.releasePointerCapture(current.pointer);
      camera.adopt(current.pointer, current.client);
      return;
    }
    if (event.button !== 0 || !event.isPrimary || camera.panMode) {
      return;
    }
    const box = camera.ref.current?.getBoundingClientRect();
    const last = box && viewportPoint(event, box);
    const at = last && mapping.toDocument(last);
    if (busy || !box || !last || !at) {
      return;
    }
    if (event.altKey && onPickSource) {
      onPickSource(at);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setError(undefined);
    const modifiers = { shift: event.shiftKey, alt: event.altKey };
    const deferred =
      typeof editOnRelease === "function"
        ? editOnRelease(modifiers)
        : editOnRelease;
    const opened = !deferred && document.history.begin();
    // The viewport diameter becomes source pixels where the stroke starts, covering the same area there.
    const size = brush.settings.size / mapping.scale(at);
    const started = onStart(
      {
        mode: erase ? "erase" : "paint",
        size,
        feather: brush.settings.feather,
        flow: brush.settings.flow,
        points: [[...at, pressure(event)]],
      },
      modifiers,
    );
    if (!started) {
      if (opened) document.history.cancel();
      return;
    }
    setDrawn(size);
    stroke.current = {
      pointer: event.pointerId,
      touch: event.pointerType === "touch",
      client: [event.clientX, event.clientY],
      box,
      last,
      pending: [],
      editOnRelease: deferred,
    };
    // The viewport below would otherwise capture the pointer to pan.
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    blurActive();
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!containsTarget(event)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const overHandle =
      !event.shiftKey &&
      !event.altKey &&
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
    current.client = [event.clientX, event.clientY];
    const native = event.nativeEvent;
    const events = native.getCoalescedEvents?.() ?? [];
    for (const item of events.length ? events : [native]) {
      const next = viewportPoint(item, current.box);
      for (const [x, y] of mapping.trail(current.last, next)) {
        current.pending.push([x, y, pressure(item)]);
      }
      current.last = next;
    }
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
  const status = error ?? (busy ? "Finishing stroke…" : undefined);
  const cursor = pointerVisible || brush.preview ? pointer : null;
  /** The dab a stroke lays at a document point: the one being drawn, or one starting there. */
  function dabAt(at: Point) {
    const radius = (drawn ?? brush.settings.size / mapping.scale(at)) / 2;
    return mapping.ellipse({ center: at, radii: [radius, radius], angle: 0 });
  }
  const under = cursor ? mapping.toDocument(cursor) : undefined;
  const dab = under ? dabAt(under) : undefined;
  return (
    <div
      ref={wheelRef}
      role="application"
      aria-label={label}
      className="absolute inset-0 cursor-none touch-none data-[pan=true]:pointer-events-none"
      data-pan={camera.panMode}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        if (!containsTarget(event)) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        setMenu([event.clientX - bounds.left, event.clientY - bounds.top]);
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={() => setPointerVisible(false)}
      onPointerCancel={(event) => {
        if (stroke.current?.pointer === event.pointerId) finish(false);
      }}
      onLostPointerCapture={(event) => {
        if (stroke.current?.pointer === event.pointerId) {
          finish(false);
        }
      }}
    >
      {children}
      {cursor && dab && !camera.panMode && (
        <BrushCursor
          at={cursor}
          dab={dab}
          feather={brush.settings.feather}
          erase={erase}
          preview={brush.preview}
        />
      )}
      {status && <CanvasHint>{status}</CanvasHint>}
      {menu && <BrushMenu at={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** The brush's size and feather where a right click opened them, as Photoshop's brush menu. */
function BrushMenu({ at, onClose }: { at: Point; onClose: () => void }) {
  const [size, feather] = useBrushInput().parameters;
  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            aria-hidden
            className="pointer-events-none absolute size-0"
            style={{ left: at[0], top: at[1] }}
          />
        }
      />
      <PopoverContent align="start" className="w-60">
        <Section>
          {[size, feather].map(({ id, ...parameter }) => (
            <Slider key={id} {...parameter} variant="panel" />
          ))}
        </Section>
      </PopoverContent>
    </Popover>
  );
}
