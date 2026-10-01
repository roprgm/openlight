import {
  createContext,
  type PointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useGpu } from "vgpu-react";
import { CanvasHint } from "@/components/editor/canvas-hint";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { findLayer } from "@/core/document";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { setMaskRange } from "./edits";
import { sampleColor } from "./sample";

const Picker = createContext<{
  /** The mask whose color range takes the color of the next click on the photo, if any. */
  picking: string | null;
  pick: (id: string) => void;
  cancel: () => void;
} | null>(null);

export function useColorPicker() {
  const picker = useContext(Picker);
  if (!picker) {
    throw new Error("A color picker provider is required.");
  }
  return picker;
}

/** Holds a pick waiting for a click on the photo; choosing another layer cancels it. */
export function ColorPickerProvider({ children }: { children: ReactNode }) {
  const document = useDocument();
  const [picking, setPicking] = useState<string | null>(null);
  useEffect(
    () => document.selection.subscribe(() => setPicking(null)),
    [document],
  );
  return (
    <Picker
      value={{ picking, pick: setPicking, cancel: () => setPicking(null) }}
    >
      {children}
    </Picker>
  );
}

/**
 * While a pick waits, a click on the photo gives the mask's color range the color there, as the
 * edited photo shows it without the overlay's tint; Escape cancels.
 */
export function ColorPickerCanvas() {
  const gpu = useGpu();
  const document = useDocument();
  const renderer = useRenderer();
  const camera = useViewport();
  const mapping = useDocumentMapping();
  const { picking, cancel } = useColorPicker();
  const size = document.resources.get(
    useScene((scene) => scene.layers[0].source),
  ).image.size;
  useShortcuts(picking ? { escape: cancel } : {});
  if (!picking) {
    return null;
  }
  async function pick(event: PointerEvent<HTMLDivElement>, id: string) {
    const box = camera.ref.current?.getBoundingClientRect();
    if (event.button !== 0 || !event.isPrimary || !box) {
      return;
    }
    event.stopPropagation();
    cancel();
    const [x, y] = mapping.toDocument(event.clientX, event.clientY, box);
    const color = await sampleColor(gpu, renderer.fullImage(), [
      x / size[0],
      y / size[1],
    ]);
    // The photo may have closed, or the mask gone or changed its range, while the color was read.
    const layer = findLayer(document.scene.getState().layers, id);
    if (
      color &&
      !document.closed &&
      layer?.kind === "mask" &&
      layer.range?.kind === "color"
    ) {
      setMaskRange(document, id, { ...layer.range, color });
    }
  }
  return (
    <div
      role="application"
      aria-label="Pick a color from the photo"
      className="absolute inset-0 cursor-crosshair touch-none data-[pan=true]:pointer-events-none"
      data-pan={camera.panMode}
      onPointerDown={(event) => pick(event, picking)}
    >
      <CanvasHint>Click the photo to pick the color to select</CanvasHint>
    </div>
  );
}
