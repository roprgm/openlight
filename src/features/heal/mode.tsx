import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import type { Point } from "@/core/image/frame";

const HealingContext = createContext<{
  feather: number;
  setFeather: (feather: number) => void;
  /** A donor chosen with Alt-click for the next strokes; without one, each stroke searches. */
  source?: Point;
  setSource: (source?: Point) => void;
  selectedPatch?: string;
  selectPatch: (id?: string) => void;
  hoveredPatch?: string;
  hoverPatch: (id?: string) => void;
} | null>(null);

/** Owns the tool's next-stroke feather and patch selection, shared by the canvas, bar, and sidebar. */
export function HealingProvider({
  children,
  onEdit,
}: {
  children: ReactNode;
  onEdit?: () => void;
}) {
  const [feather, setFeather] = useState(0.1);
  const [source, setSource] = useState<Point>();
  const [selectedPatch, setSelectedPatch] = useState<string>();
  const [hoveredPatch, setHoveredPatch] = useState<string>();
  const selectPatch = useCallback(
    (id?: string) => {
      setSelectedPatch(id);
      if (id) onEdit?.();
    },
    [onEdit],
  );
  return (
    <HealingContext
      value={{
        feather,
        setFeather,
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
