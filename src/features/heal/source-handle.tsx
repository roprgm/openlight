import { type PointerEvent, useEffect, useRef } from "react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import type { SmartHealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { setHealSource } from "./edits";

type Drag = {
  pointer: number;
  box?: DOMRect;
  from: Point;
  offset: Point;
  next: Point;
};

/** Moves one Smart clone donor as a single history edit. */
export function HealSourceHandle({
  layer,
  patch,
  center,
  onPreview,
  onRelease,
}: {
  layer: string;
  patch: SmartHealPatch;
  center: Point;
  onPreview?: (offset?: Point) => void;
  onRelease?: (signal: AbortSignal) => Promise<void>;
}) {
  const document = useDocument();
  const mapping = useDocumentMapping();
  const camera = useViewport();
  const drag = useRef<Drag | undefined>(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  const opened = useRef(false);
  /** A drag inside an open group, such as a finishing stroke, joins it and leaves the group to its opener. */
  function end(commit: boolean) {
    if (!opened.current) return;
    opened.current = false;
    if (commit) document.history.commit();
    else document.history.cancel();
  }
  function point(event: PointerEvent<SVGCircleElement>, box?: DOMRect) {
    return mapping.toDocument(event.clientX, event.clientY, box);
  }
  function cancel() {
    if (!drag.current) return;
    drag.current = undefined;
    onPreview?.();
    end(false);
  }
  useEffect(
    () => () => {
      pending.current?.abort();
      end(false);
    },
    [],
  );
  function start(event: PointerEvent<SVGCircleElement>) {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      camera.panMode ||
      pending.current
    )
      return;
    const box = camera.ref.current?.getBoundingClientRect();
    opened.current = document.history.begin();
    drag.current = {
      pointer: event.pointerId,
      box,
      from: point(event, box),
      offset: patch.offset,
      next: patch.offset,
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGCircleElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const next = point(event, current.box);
    const offset: Point = [
      current.offset[0] + next[0] - current.from[0],
      current.offset[1] + next[1] - current.from[1],
    ];
    current.next = offset;
    onPreview?.(offset);
    event.preventDefault();
    event.stopPropagation();
  }
  function finish(event: PointerEvent<SVGCircleElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = undefined;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    const moved =
      current.next[0] !== current.offset[0] ||
      current.next[1] !== current.offset[1];
    if (!moved) {
      onPreview?.();
      end(false);
      return;
    }
    setHealSource(document, layer, patch.id, current.next);
    onPreview?.();
    if (!onRelease) {
      end(true);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    void onRelease(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) end(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) end(false);
      })
      .finally(() => {
        if (pending.current === controller) pending.current = undefined;
      });
  }
  return (
    <circle
      data-heal-source-handle="true"
      data-hide-brush-cursor="true"
      cx={center[0]}
      cy={center[1]}
      r="7"
      fill="#3b82f6"
      stroke="white"
      strokeWidth="2"
      className="pointer-events-auto cursor-grab active:cursor-grabbing"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    />
  );
}
