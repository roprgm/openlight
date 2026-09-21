import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { findLayer, type Gradient, locateLayer } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { setLayerMask } from "./edits";
import {
  drawGradient,
  type GradientHandle,
  gradientHandles,
  moveGradient,
} from "./gradient";
import { GradientGuides } from "./gradient-guides";
import { type Nesting, useMaskTool } from "./mask-tool";

type Drag = {
  pointer: number;
  /** The viewport bounds measured once; pointer capture keeps them valid for the drag. */
  box: DOMRect | undefined;
  from: Point;
  to: Point;
  mask: Gradient;
  handle: GradientHandle | "new";
  id: string;
  /** Alt while starting a drag subtracts the new gradient from the selected mask. */
  nesting?: Nesting;
};

/** Draws masks of one shape and edits the selected gradient's guides; Enter or Escape leaves. */
export function GradientOverlay({ shape }: { shape: Gradient["kind"] }) {
  const document = useDocument();
  const tool = useMaskTool();
  const camera = useViewport();
  const mapping = useDocumentMapping();
  const selected = useStore(document.selection, (state) => state.layerId);
  const layer = useScene((scene) => {
    const item = findLayer(scene.layers, selected);
    return item?.kind === "mask" ? item : undefined;
  });
  /** Only gradients have guides; a brush mask keeps the deletion shortcuts. */
  const mask = layer?.mask.kind === "brush" ? undefined : layer?.mask;
  const [draft, setDraft] = useState<Gradient | null>(null);
  const dragging = useRef<Drag | null>(null);
  const [dragCursor, setDragCursor] = useState<string>();
  /** Ends any drag, restoring the scene unless it was committed. */
  function reset() {
    if (dragging.current && dragging.current.handle !== "new") {
      document.history.cancel();
    }
    dragging.current = null;
    setDraft(null);
    tool.draft.setState(null);
    setDragCursor(undefined);
  }
  useEffect(
    () => () => {
      if (dragging.current && dragging.current.handle !== "new") {
        document.history.cancel();
      }
      tool.draft.setState(null);
    },
    [document, tool.draft],
  );
  useShortcuts({
    escape: () => (dragging.current ? reset() : tool.edit()),
    enter: () => {
      if (!dragging.current) {
        tool.edit();
      }
    },
  });
  function documentPoint(event: PointerEvent, box: DOMRect | undefined): Point {
    return mapping.toDocument(event.clientX, event.clientY, box);
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || camera.panMode) {
      return;
    }
    const target =
      event.target instanceof Element
        ? event.target
            .closest("[data-gradient-handle]")
            ?.getAttribute("data-gradient-handle")
        : null;
    const handle = gradientHandles.find((handle) => handle === target);
    // Guides win over drawing, unless a chosen nesting is waiting for this shape.
    const drawing = !handle || !mask || tool.pending?.shape === shape;
    const box = camera.ref.current?.getBoundingClientRect();
    const from = documentPoint(event, box);
    if (drawing) {
      const location = locateLayer(document.scene.getState().layers, selected);
      const group =
        location?.parent?.kind === "mask" ? location.parent : location?.layer;
      dragging.current = {
        pointer: event.pointerId,
        box,
        from,
        to: from,
        mask: drawGradient(shape, from, from),
        handle: "new",
        id: selected,
        nesting:
          event.altKey && group?.kind === "mask"
            ? { parentId: group.id, operation: "subtract" }
            : undefined,
      };
      setDraft(dragging.current.mask);
    } else if (mask && handle) {
      document.history.commit();
      document.history.begin();
      dragging.current = {
        pointer: event.pointerId,
        box,
        from,
        to: from,
        mask,
        handle,
        id: selected,
      };
    }
    const cursor =
      event.target instanceof Element
        ? getComputedStyle(event.target).cursor
        : "grab";
    const activeCursor = cursor === "grab" ? "grabbing" : cursor;
    setDragCursor(drawing ? "crosshair" : activeCursor);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    // Keys after a drag belong to the mask, not to the button that started the tool.
    if (window.document.activeElement instanceof HTMLElement) {
      window.document.activeElement.blur();
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const drag = dragging.current;
    if (!drag || drag.pointer !== event.pointerId) {
      return;
    }
    const point = documentPoint(event, drag.box);
    drag.to = point;
    if (drag.handle === "new") {
      const next = drawGradient(
        drag.mask.kind,
        drag.from,
        point,
        event.shiftKey,
      );
      drag.mask = next;
      setDraft(next);
      tool.draft.setState(next);
    } else {
      setLayerMask(
        document,
        drag.id,
        moveGradient(drag.mask, drag.handle, drag.from, point),
      );
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const drag = dragging.current;
    if (!drag || drag.pointer !== event.pointerId) {
      return;
    }
    // Commit the last preview; pointerup must not reinterpret geometry or Shift.
    if (drag.handle === "new") {
      const point = drag.to;
      const distance =
        Math.hypot(point[0] - drag.from[0], point[1] - drag.from[1]) *
        camera.scale;
      if (distance >= 3) {
        tool.create(drag.mask, drag.nesting);
      }
    } else {
      document.history.commit();
    }
    reset();
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const visible = draft ?? mask;
  // The empty canvas draws, so it shows a crosshair; guides keep their own cursors until a drag starts.
  const cursor = dragCursor ?? "crosshair";
  return (
    <div
      role="application"
      aria-label="Gradient mask canvas"
      className="absolute inset-0 touch-none data-[cursor=true]:[&_*]:cursor-[inherit]! data-[pan=true]:pointer-events-none"
      data-cursor={!!dragCursor}
      data-pan={camera.panMode}
      style={{ cursor }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={reset}
      onLostPointerCapture={() => {
        if (dragging.current) {
          reset();
        }
      }}
    >
      {visible && !camera.panMode && (
        <GradientGuides
          mask={visible}
          screen={mapping.toScreen}
          extent={Math.hypot(...camera.viewport)}
        />
      )}
      <p className="pointer-events-none absolute -bottom-3 -left-3 rounded-full bg-neutral-800/80 px-3 py-1.5 text-white backdrop-blur-sm">
        Drag to draw · Shift constrains · Alt subtracts from the selected mask ·
        Enter when done
      </p>
    </div>
  );
}
