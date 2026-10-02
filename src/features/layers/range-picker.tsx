import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { useStore } from "zustand";
import { CanvasHint } from "@/components/editor/canvas-hint";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { eyedropperCursor } from "@/components/icons/eyedropper-cursor";
import { findLayer, locateLayer } from "@/core/document";
import { useDisposable } from "@/hooks/use-disposable";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { createColorSampler } from "./color-sample";
import { setLayerMask } from "./edits";
import { useMaskTool } from "./mask-tool";
import { defaultTolerance } from "./model";

type Drag = {
  pointer: number;
  /** The viewport bounds measured once; pointer capture keeps them valid for the drag. */
  box: DOMRect;
  target: string;
  adding: boolean;
  opened: boolean;
  /** Whether the drag was cancelled, so colors still to land change nothing. */
  cancelled: boolean;
  /** The latest color to land, which the drag waits for before it ends. */
  landed: Promise<void>;
};

/**
 * Picks color ranges from the photo: a click gives the selected color range the color under the
 * pointer, or makes a new one where a menu chose or on top, and dragging keeps picking as one edit.
 * Colors come from the image below the range's mask group, the one it selects from, so its own edit
 * never feeds back. Enter or Escape leaves.
 */
export function RangePicker() {
  const gpu = useGpu();
  const document = useDocument();
  const renderer = useRenderer();
  const camera = useViewport();
  const mapping = useDocumentMapping();
  const tool = useMaskTool();
  const sampler = useDisposable(() => createColorSampler(gpu), [gpu]);
  const selected = useStore(document.selection, (state) => state.layerId);
  const editing = useScene((scene) => {
    const layer = findLayer(scene.layers, selected);
    return layer?.kind === "mask" && layer.mask.kind === "color-range";
  });
  const group = useScene((scene) => {
    const parent = locateLayer(scene.layers, selected)?.parent;
    return parent?.kind === "mask" ? parent.id : selected;
  });
  const size = document.resources.get(
    useScene((scene) => scene.layers[0].source),
  ).image.size;
  const pending = tool.pending?.shape === "color-range" ? tool.pending : null;
  const creating = Boolean(pending) || !editing;
  // A new color range reads below its parent, or, going on top, the whole photo as it shows.
  const source = creating ? pending?.parentId : group;
  const [error, setError] = useState("");
  const live = useRef(true);
  useEffect(() => {
    document.preview.setState({ rangeSource: source });
    return () => document.preview.setState({ rangeSource: undefined });
  }, [document, source]);
  const drag = useRef<Drag | null>(null);
  const inFlight = useRef(new Set<Drag>());
  /** The previous drag's end, which a new drag's colors wait for so the two edits never overlap. */
  const ended = useRef<Promise<void>>(Promise.resolve());
  function cancelDrag(current: Drag) {
    current.cancelled = true;
    if (current.opened) {
      current.opened = false;
      document.history.cancel();
    }
  }
  /** Gives the drag's color range a color, while it is one. */
  function recolor(id: string, color: string) {
    const layer = findLayer(document.scene.getState().layers, id);
    if (layer?.kind === "mask" && layer.mask.kind === "color-range") {
      setLayerMask(document, id, { ...layer.mask, color });
    }
  }
  /**
   * Picks the color under the pointer. A new range is its own edit, made with the first color to
   * land, whichever read that is; the picking that follows, that color included, is one more.
   */
  function pick(current: Drag, event: PointerEvent) {
    const [x, y] = mapping.toDocument(
      event.clientX,
      event.clientY,
      current.box,
    );
    const image = () =>
      source ? renderer.rangeSource(source) : renderer.fullImage();
    const color = sampler.sample(image, [x / size[0], y / size[1]]);
    current.landed = Promise.all([current.landed, color])
      .then(([, color]) => {
        if (!color || current.cancelled || document.closed) {
          return;
        }
        if (!current.opened) {
          if (document.history.status.getState().editing) {
            current.cancelled = true;
            if (live.current) {
              setError("Finish the current edit before picking a color.");
            }
            return;
          }
          if (creating) {
            current.adding = true;
            try {
              tool.create({
                kind: "color-range",
                color,
                tolerance: defaultTolerance,
              });
              current.target = document.selection.getState().layerId;
            } finally {
              current.adding = false;
            }
          }
          if (document.selection.getState().layerId !== current.target) {
            cancelDrag(current);
            return;
          }
          current.opened = document.history.begin();
          if (!current.opened) {
            cancelDrag(current);
            return;
          }
        }
        if (document.selection.getState().layerId !== current.target) {
          cancelDrag(current);
          return;
        }
        recolor(current.target, color);
      })
      .catch(() => {
        cancelDrag(current);
        if (live.current) {
          setError("Couldn't pick a color. Try again.");
        }
      });
  }
  function end(cancel: boolean) {
    const current = drag.current;
    if (!current) {
      return;
    }
    drag.current = null;
    if (cancel) {
      cancelDrag(current);
    }
    ended.current = current.landed.then(() => {
      inFlight.current.delete(current);
      if (current.opened) {
        current.opened = false;
        document.history.commit();
      }
    });
  }
  useEffect(() => {
    live.current = true;
    const selection = document.selection.subscribe(({ layerId }) => {
      for (const current of inFlight.current) {
        if (!current.adding && current.target !== layerId) {
          cancelDrag(current);
        }
      }
    });
    const history = document.history.status.subscribe(({ editing }) => {
      if (!editing) {
        for (const current of inFlight.current) {
          if (current.opened) {
            current.opened = false;
            current.cancelled = true;
          }
        }
      }
    });
    return () => {
      live.current = false;
      selection();
      history();
      end(true);
      for (const current of inFlight.current) {
        cancelDrag(current);
      }
    };
  }, [document]);
  useShortcuts({
    escape: () => (drag.current ? end(true) : tool.edit()),
    enter: () => {
      if (!drag.current) {
        tool.edit();
      }
    },
  });
  function start(event: PointerEvent<HTMLDivElement>) {
    const box = camera.ref.current?.getBoundingClientRect();
    if (event.button !== 0 || !event.isPrimary || !box) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current: Drag = {
      pointer: event.pointerId,
      box,
      target: selected,
      adding: false,
      opened: false,
      cancelled: false,
      landed: ended.current,
    };
    drag.current = current;
    inFlight.current.add(current);
    setError("");
    pick(current, event);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current?.pointer === event.pointerId) {
      pick(current, event);
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    end(false);
  }
  return (
    <div
      role="application"
      aria-label="Color range canvas"
      className="absolute inset-0 touch-none data-[pan=true]:pointer-events-none"
      style={{ cursor: eyedropperCursor }}
      data-pan={camera.panMode}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={() => end(true)}
      onLostPointerCapture={() => end(false)}
    >
      <CanvasHint>
        {error || "Click or drag over the photo to pick the color to select"}
      </CanvasHint>
    </div>
  );
}
