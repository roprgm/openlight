import { type PointerEvent, useEffect, useRef } from "react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import type { Point } from "@/core/image/frame";

type Drag = {
  pointer: number;
  box: DOMRect;
  start: Point;
  /** The value when the drag began; a live edit changes the rendered value under the pointer. */
  from: Point;
  next: Point;
};

/** A dragged value: the destination's first point or the donor offset, changed as one history edit. */
export type AnchorDrag = {
  from: Point;
  /** Follows the pointer; no value ends the drag. */
  onDrag: (next?: Point) => void;
  onDrop: (next: Point) => void;
};

const marker = { r: 7, fill: "#3b82f6", stroke: "white", strokeWidth: 2 };

/** The first-point anchor of a destination or source contour, draggable while its patch is selected. */
export function HealAnchor({
  kind,
  center,
  drag,
}: {
  kind: "destination" | "source";
  center: Point;
  drag?: AnchorDrag;
}) {
  if (drag) return <DraggedAnchor kind={kind} center={center} drag={drag} />;
  return (
    <circle
      {...{ [`data-heal-${kind}-anchor`]: "true" }}
      cx={center[0]}
      cy={center[1]}
      {...marker}
    />
  );
}

function DraggedAnchor({
  kind,
  center,
  drag,
}: {
  kind: "destination" | "source";
  center: Point;
  drag: AnchorDrag;
}) {
  const document = useDocument();
  const mapping = useDocumentMapping();
  const camera = useViewport();
  const current = useRef<Drag | undefined>(undefined);
  const opened = useRef(false);
  /** A drag inside an open group, such as a finishing stroke, joins it and leaves the group to its opener. */
  function end(commit: boolean) {
    if (!opened.current) return;
    opened.current = false;
    if (commit) document.history.commit();
    else document.history.cancel();
  }
  function point(event: PointerEvent<SVGCircleElement>, box: DOMRect) {
    return mapping.toDocument(event.clientX, event.clientY, box);
  }
  function cancel() {
    if (!current.current) return;
    current.current = undefined;
    drag.onDrag();
    end(false);
  }
  useEffect(() => () => end(false), []);
  function start(event: PointerEvent<SVGCircleElement>) {
    const box = camera.ref.current?.getBoundingClientRect();
    if (event.button !== 0 || !event.isPrimary || camera.panMode || !box) {
      return;
    }
    opened.current = document.history.begin();
    current.current = {
      pointer: event.pointerId,
      box,
      start: point(event, box),
      from: drag.from,
      next: drag.from,
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGCircleElement>) {
    const active = current.current;
    if (!active || active.pointer !== event.pointerId) return;
    const at = point(event, active.box);
    active.next = [
      active.from[0] + at[0] - active.start[0],
      active.from[1] + at[1] - active.start[1],
    ];
    drag.onDrag(active.next);
    event.preventDefault();
    event.stopPropagation();
  }
  function finish(event: PointerEvent<SVGCircleElement>) {
    const active = current.current;
    if (!active || active.pointer !== event.pointerId) return;
    current.current = undefined;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    const moved =
      active.next[0] !== active.from[0] || active.next[1] !== active.from[1];
    if (!moved) {
      drag.onDrag();
      end(false);
      return;
    }
    drag.onDrop(active.next);
    drag.onDrag();
    end(true);
  }
  return (
    <circle
      {...{ [`data-heal-${kind}-handle`]: "true" }}
      data-hide-brush-cursor="true"
      cx={center[0]}
      cy={center[1]}
      {...marker}
      className="pointer-events-auto cursor-grab active:cursor-grabbing"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    />
  );
}
