import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { findLayer, type Layer } from "@/core/document";
import { clamp } from "@/lib/math";
import { useDocument, useScene } from "./session";

/** What the brush paints: color on a paint layer, or coverage on a brush mask. */
export type BrushMode = "color" | "mask";

export type BrushSettings = {
  /** Diameter in source pixels. */
  size: number;
  /** Soft edge as a fraction of the radius, 0 to 1. */
  feather: number;
  flow: number;
  erase: boolean;
  mode: BrushMode;
  /** The primary color, which strokes paint, and the secondary, as `#rrggbb`. */
  colors: readonly [string, string];
};

/** Black over white, as Photoshop starts. */
export const defaultColors = ["#000000", "#ffffff"] as const;

/** The mode that paints on `layer`, if the brush can paint on it. */
export function brushMode(layer: Layer | undefined): BrushMode | undefined {
  if (layer?.kind === "paint") {
    return "color";
  }
  if (layer?.kind === "mask" && layer.mask.kind === "brush") {
    return "mask";
  }
  return undefined;
}

const BrushTool = createContext<{
  settings: BrushSettings;
  /** The mode the next stroke uses: the setting, inverted while Alt is held. */
  erase: boolean;
  /** The largest useful diameter: half the image's long edge. */
  maxSize: number;
  /** Keeps the brush cursor visible while a setting that shapes it is edited. */
  preview: boolean;
  setPreview: (preview: boolean) => void;
  update: (change: Partial<BrushSettings>) => void;
} | null>(null);

export function useBrushTool() {
  const tool = useContext(BrushTool);
  if (!tool) {
    throw new Error("A brush tool provider is required.");
  }
  return tool;
}

/**
 * Brush settings outlive strokes and tool switches; they start relative to the image size. The mode
 * follows the selection onto a paint layer or brush mask, so the brush paints what is selected.
 */
export function BrushProvider({ children }: { children: ReactNode }) {
  const document = useDocument();
  const sourceId = useScene((scene) => scene.layers[0].source);
  const size = document.resources.get(sourceId).image.size;
  const longest = Math.max(size[0], size[1]);
  const maxSize = Math.max(1, Math.round(longest / 2));
  // 3% of the image in steps of 5, never under 10 px unless the image itself is that small.
  const initialSize = Math.min(
    maxSize,
    Math.max(10, Math.round((longest * 0.03) / 5) * 5),
  );
  const [settings, setSettings] = useState<BrushSettings>({
    size: initialSize,
    feather: 0.5,
    flow: 1,
    erase: false,
    mode: "mask",
    colors: defaultColors,
  });
  const [alt, setAlt] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(
    () =>
      document.selection.subscribe(({ layerId }) => {
        const mode = brushMode(
          findLayer(document.scene.getState().layers, layerId),
        );
        if (mode) {
          setSettings((settings) => ({ ...settings, mode }));
        }
      }),
    [document],
  );
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const track = (event: KeyboardEvent) => setAlt(event.altKey);
    window.addEventListener("keydown", track, { signal });
    window.addEventListener("keyup", track, { signal });
    window.addEventListener("blur", () => setAlt(false), { signal });
    return () => controller.abort();
  }, []);
  function update(change: Partial<BrushSettings>) {
    setSettings((settings) => ({
      ...settings,
      ...change,
      size: clamp(change.size ?? settings.size, 1, maxSize),
    }));
  }
  return (
    <BrushTool
      value={{
        settings,
        erase: settings.erase !== alt,
        maxSize,
        preview,
        setPreview,
        update,
      }}
    >
      {children}
    </BrushTool>
  );
}
