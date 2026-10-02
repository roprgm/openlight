import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { findLayer, type Layer } from "@/core/document";
import {
  type BrushInput,
  type BrushShape,
  brushParameters,
  useBrushSettings,
} from "./brush-input";
import type { Parameter } from "./parameter";
import { useDocument } from "./session";

/** What the brush paints: color on a paint layer, or coverage on a brush mask. */
export type BrushMode = "color" | "mask";

export type BrushSettings = BrushShape & {
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

const BrushTool = createContext<
  | (Omit<BrushInput, "settings" | "update"> & {
      settings: BrushSettings;
      /** The mode the next stroke uses: the setting, inverted while Alt is held. */
      erase: boolean;
      update: (change: Partial<BrushSettings>) => void;
    })
  | null
>(null);

export function useBrushTool() {
  const tool = useContext(BrushTool);
  if (!tool) {
    throw new Error("A brush tool provider is required.");
  }
  return tool;
}

/**
 * Brush settings outlive strokes and tool switches; size stays fixed on screen. The mode
 * follows the selection onto a paint layer or brush mask, so the brush paints what is selected.
 */
export function BrushProvider({ children }: { children: ReactNode }) {
  const document = useDocument();
  const brush = useBrushSettings(0.5);
  const [paint, setPaint] = useState<
    Pick<BrushSettings, "erase" | "mode" | "colors">
  >({ erase: false, mode: "mask", colors: defaultColors });
  const [alt, setAlt] = useState(false);
  useEffect(
    () =>
      document.selection.subscribe(({ layerId }) => {
        const mode = brushMode(
          findLayer(document.scene.getState().layers, layerId),
        );
        if (mode) {
          setPaint((paint) => ({ ...paint, mode }));
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
  function update({ size, feather, flow, ...change }: Partial<BrushSettings>) {
    brush.update({ size, feather, flow });
    setPaint((paint) => ({ ...paint, ...change }));
  }
  const settings = { ...brush.settings, ...paint };
  const [size, feather] = brushParameters(brush);
  const parameters: [Parameter, Parameter] = [
    size,
    { ...feather, defaultValue: 50 },
  ];
  return (
    <BrushTool
      value={{
        ...brush,
        settings,
        parameters,
        erase: settings.erase !== alt,
        update,
      }}
    >
      {children}
    </BrushTool>
  );
}

/** How the Flow slider curves: flow is its share to this power, so 50% lays a quarter and low values stay light. */
const flowCurve = 2;

export function flowAt(share: number) {
  return share ** flowCurve;
}

/** The next stroke's size, feather, and flow, for sliders and dials wherever they show. */
export function useBrushParameters(): [Parameter, Parameter, Parameter] {
  const { settings, parameters, update } = useBrushTool();
  return [
    ...parameters,
    {
      id: "flow",
      label: "Flow",
      value: Math.round(settings.flow ** (1 / flowCurve) * 100),
      min: 1,
      max: 100,
      defaultValue: 100,
      origin: 0,
      format: (value) => `${value}%`,
      valueWidth: 3,
      onChange: (value) => update({ flow: flowAt(value / 100) }),
    },
  ];
}
