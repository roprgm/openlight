import { type PointerEvent, useRef } from "react";
import { useGpu } from "vgpu-react";
import { useStore } from "zustand";
import { CanvasHint } from "@/components/editor/canvas-hint";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { findLayer } from "@/core/document";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { sampleColor } from "./color-sample";
import { setLayerMask } from "./edits";
import { useMaskTool } from "./mask-tool";
import { defaultTolerance } from "./model";

/**
 * Picks color ranges from the photo, as the edited photo shows it without the overlay's tint: a click
 * gives the selected color range its color, or makes a new one where a menu chose or on top. Enter or
 * Escape leaves.
 */
export function RangePicker() {
  const gpu = useGpu();
  const document = useDocument();
  const renderer = useRenderer();
  const camera = useViewport();
  const mapping = useDocumentMapping();
  const tool = useMaskTool();
  const selected = useStore(document.selection, (state) => state.layerId);
  const editing = useScene((scene) => {
    const layer = findLayer(scene.layers, selected);
    return layer?.kind === "mask" && layer.mask.kind === "color-range";
  });
  const size = document.resources.get(
    useScene((scene) => scene.layers[0].source),
  ).image.size;
  /** Counts clicks, so only the latest one's color lands. */
  const picks = useRef(0);
  useShortcuts({ escape: () => tool.edit(), enter: () => tool.edit() });
  async function pick(event: PointerEvent<HTMLDivElement>) {
    const box = camera.ref.current?.getBoundingClientRect();
    if (event.button !== 0 || !event.isPrimary || !box) {
      return;
    }
    event.stopPropagation();
    const pick = ++picks.current;
    const creating = tool.pending?.shape === "color-range" || !editing;
    const [x, y] = mapping.toDocument(event.clientX, event.clientY, box);
    const color = await sampleColor(gpu, renderer.fullImage(), [
      x / size[0],
      y / size[1],
    ]);
    if (!color || pick !== picks.current || document.closed) {
      return;
    }
    if (creating) {
      tool.create({ kind: "color-range", color, tolerance: defaultTolerance });
      return;
    }
    const layer = findLayer(document.scene.getState().layers, selected);
    if (layer?.kind === "mask" && layer.mask.kind === "color-range") {
      setLayerMask(document, selected, { ...layer.mask, color });
    }
  }
  return (
    <div
      role="application"
      aria-label="Color range canvas"
      className="absolute inset-0 cursor-crosshair touch-none data-[pan=true]:pointer-events-none"
      data-pan={camera.panMode}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={pick}
    >
      <CanvasHint>Click the photo to pick the color to select</CanvasHint>
    </div>
  );
}
