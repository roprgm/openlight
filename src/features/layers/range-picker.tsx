import { type PointerEvent, useEffect, useRef } from "react";
import { useGpu } from "vgpu-react";
import { useStore } from "zustand";
import { CanvasHint } from "@/components/editor/canvas-hint";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
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
  /** The latest color to land, which the drag waits for before it ends. */
  landed: Promise<unknown>;
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
  useEffect(() => {
    document.preview.setState({ rangeSource: source });
    return () => document.preview.setState({ rangeSource: undefined });
  }, [document, source]);
  const drag = useRef<Drag | null>(null);
  /** Gives the selected color range a color, while it is one. */
  function recolor(color: string) {
    const id = document.selection.getState().layerId;
    const layer = findLayer(document.scene.getState().layers, id);
    if (layer?.kind === "mask" && layer.mask.kind === "color-range") {
      setLayerMask(document, id, { ...layer.mask, color });
    }
  }
  function pick(event: PointerEvent, box: DOMRect) {
    const [x, y] = mapping.toDocument(event.clientX, event.clientY, box);
    const image = () =>
      source ? renderer.rangeSource(source) : renderer.fullImage();
    return sampler.sample(image, [x / size[0], y / size[1]]);
  }
  function end(cancel: boolean) {
    const current = drag.current;
    drag.current = null;
    void current?.landed.finally(() =>
      cancel ? document.history.cancel() : document.history.commit(),
    );
  }
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
    // A new range is its own edit; the picking that follows, the first color included, is one more.
    const landed = pick(event, box).then((color) => {
      if (!color || document.closed) {
        return;
      }
      if (creating) {
        tool.create({
          kind: "color-range",
          color,
          tolerance: defaultTolerance,
        });
      }
      document.history.begin();
      recolor(color);
    });
    drag.current = { pointer: event.pointerId, box, landed };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) {
      return;
    }
    const color = pick(event, current.box);
    current.landed = Promise.all([current.landed, color]).then(([, color]) => {
      if (color && !document.closed) {
        recolor(color);
      }
    });
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
      className="absolute inset-0 cursor-crosshair touch-none data-[pan=true]:pointer-events-none"
      data-pan={camera.panMode}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={() => end(true)}
      onLostPointerCapture={() => {
        if (drag.current) {
          end(false);
        }
      }}
    >
      <CanvasHint>
        Click or drag over the photo to pick the color to select
      </CanvasHint>
    </div>
  );
}
