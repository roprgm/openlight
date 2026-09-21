import { type PointerEvent, useEffect, useRef } from "react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import type { HealPatch } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { setHealDestination } from "./edits";

type Drag = {
  pointer: number;
  box?: DOMRect;
  from: Point;
  destination: Point;
  next: Point;
};

/** Moves one destination as a single edit and regenerates AI only after release. */
export function HealDestinationHandle({
  layer,
  patch,
  anchor,
  onPreview,
  onRelease,
}: {
  layer: string;
  patch: HealPatch;
  anchor: Point;
  onPreview?: (destination?: Point) => void;
  onRelease?: (signal: AbortSignal) => Promise<void>;
}) {
  const document = useDocument();
  const mapping = useDocumentMapping();
  const camera = useViewport();
  const drag = useRef<Drag | undefined>(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  function point(event: PointerEvent<SVGCircleElement>, box?: DOMRect) {
    return mapping.toDocument(event.clientX, event.clientY, box);
  }
  function cancelDrag() {
    if (!drag.current) return;
    drag.current = undefined;
    onPreview?.();
    document.history.cancel();
  }
  useEffect(
    () => () => {
      pending.current?.abort();
      if (drag.current || pending.current) document.history.cancel();
    },
    [],
  );
  function start(event: PointerEvent<SVGCircleElement>) {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      camera.panMode ||
      pending.current
    ) {
      return;
    }
    const box = camera.ref.current?.getBoundingClientRect();
    const [x, y] = patch.stroke.points[0];
    document.history.commit();
    document.history.begin();
    drag.current = {
      pointer: event.pointerId,
      box,
      from: point(event, box),
      destination: [x, y],
      next: [x, y],
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGCircleElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const next = point(event, current.box);
    const destination: Point = [
      current.destination[0] + next[0] - current.from[0],
      current.destination[1] + next[1] - current.from[1],
    ];
    current.next = destination;
    if (patch.algorithm === "ai") {
      onPreview?.(destination);
    } else {
      setHealDestination(document, layer, patch.id, destination);
    }
    event.preventDefault();
    event.stopPropagation();
  }
  function finish(event: PointerEvent<SVGCircleElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = undefined;
    const moved =
      current.next[0] !== current.destination[0] ||
      current.next[1] !== current.destination[1];
    if (!moved) {
      onPreview?.();
      document.history.cancel();
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (patch.algorithm === "ai") {
      setHealDestination(document, layer, patch.id, current.next);
      onPreview?.();
    }
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!onRelease) {
      document.history.commit();
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    void onRelease(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) document.history.commit();
      })
      .catch(() => {
        if (!controller.signal.aborted) document.history.cancel();
      })
      .finally(() => {
        if (pending.current === controller) pending.current = undefined;
      });
  }
  return (
    <circle
      data-heal-destination-handle="true"
      cx={anchor[0]}
      cy={anchor[1]}
      r="7"
      fill="#3b82f6"
      stroke="white"
      strokeWidth="2"
      className="pointer-events-auto cursor-grab active:cursor-grabbing"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={cancelDrag}
    />
  );
}
