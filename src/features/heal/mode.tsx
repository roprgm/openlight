import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import {
  type BrushInput,
  brushParameters,
  useBrushSettings,
} from "@/components/editor/brush-input";
import { useDocument, useSelectedLayer } from "@/components/editor/session";
import { findLayer, type HealMode } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { setHealPatch } from "./edits";

const HealingContext = createContext<{
  brush: Omit<BrushInput, "parameters">;
  mode: HealMode;
  selectMode: (mode: HealMode) => void;
  /** A donor chosen with Alt-click for the next strokes; without one, each stroke searches. */
  source?: Point;
  setSource: (source?: Point) => void;
  selectedPatch?: string;
  selectPatch: (id?: string) => void;
  hoveredPatch?: string;
  hoverPatch: (id?: string) => void;
} | null>(null);

/** Settings outlive tool visits; each recorded patch keeps its own mode and blend. */
export function HealingProvider({
  children,
  onEdit,
}: {
  children: ReactNode;
  onEdit?: () => void;
}) {
  const document = useDocument();
  const brush = useBrushSettings(0.1);
  const [mode, setMode] = useState<HealMode>("heal");
  const [source, setSource] = useState<Point>();
  const [selectedPatch, setSelectedPatch] = useState<string>();
  const [hoveredPatch, setHoveredPatch] = useState<string>();
  const selectPatch = useCallback(
    (id?: string) => {
      setSelectedPatch(id);
      if (!id) return;
      const layer = findLayer(
        document.scene.getState().layers,
        document.selection.getState().layerId,
      );
      const patch =
        layer?.kind === "heal" &&
        layer.patches.find((patch) => patch.id === id);
      if (patch) setMode(patch.mode);
      onEdit?.();
    },
    [document, onEdit],
  );
  function selectMode(mode: HealMode) {
    setMode(mode);
    setSelectedPatch(undefined);
    setHoveredPatch(undefined);
    onEdit?.();
  }
  return (
    <HealingContext
      value={{
        brush,
        mode,
        selectMode,
        source,
        setSource,
        selectedPatch,
        selectPatch,
        hoveredPatch,
        hoverPatch: setHoveredPatch,
      }}
    >
      {children}
    </HealingContext>
  );
}

export function useHealing() {
  const context = useContext(HealingContext);
  if (!context) throw Error("A healing provider is required.");
  return context;
}

export function useSelectedHealPatch() {
  const { selectedPatch } = useHealing();
  const layer = useSelectedLayer();
  if (layer?.kind !== "heal") return undefined;
  return layer.patches.find((patch) => patch.id === selectedPatch);
}

/** The controls edit the selected patch's feather and remember it for the next stroke. */
export function useHealBrush(): BrushInput {
  const { brush } = useHealing();
  const document = useDocument();
  const layer = useSelectedLayer();
  const selected = useSelectedHealPatch();
  function update(change: Parameters<typeof brush.update>[0]) {
    brush.update(change);
    if (change.feather !== undefined && selected && layer?.kind === "heal") {
      setHealPatch(document, layer.id, selected.id, {
        feather: change.feather,
      });
    }
  }
  const [size, feather] = brushParameters({ ...brush, update });
  return {
    ...brush,
    update,
    parameters: [
      size,
      {
        ...feather,
        value: Math.round((selected?.feather ?? brush.settings.feather) * 100),
      },
    ],
  };
}
