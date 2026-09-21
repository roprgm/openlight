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
};

/** Moves one Smart clone donor as a single history edit. */
export function HealSourceHandle({
  layer,
  patch,
  center,
}: {
  layer: string;
  patch: SmartHealPatch;
  center: Point;
}) {
  const document = useDocument();
  const mapping = useDocumentMapping();
  const camera = useViewport();
  const drag = useRef<Drag | undefined>(undefined);
  function point(event: PointerEvent<SVGCircleElement>, box?: DOMRect) {
    return mapping.toDocument(event.clientX, event.clientY, box);
  }
  function cancel() {
    if (!drag.current) return;
    drag.current = undefined;
    document.history.cancel();
  }
  useEffect(() => cancel, []);
  function start(event: PointerEvent<SVGCircleElement>) {
    if (event.button !== 0 || !event.isPrimary || camera.panMode) return;
    const box = camera.ref.current?.getBoundingClientRect();
    document.history.commit();
    document.history.begin();
    drag.current = {
      pointer: event.pointerId,
      box,
      from: point(event, box),
      offset: patch.offset,
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGCircleElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const next = point(event, current.box);
    setHealSource(document, layer, patch.id, [
      current.offset[0] + next[0] - current.from[0],
      current.offset[1] + next[1] - current.from[1],
    ]);
    event.preventDefault();
    event.stopPropagation();
  }
  function finish(event: PointerEvent<SVGCircleElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = undefined;
    document.history.commit();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <circle
      data-heal-source-handle="true"
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
