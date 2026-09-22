import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useGpu } from "vgpu-react";
import type { HealAlgorithm } from "@/core/document";
import { AiRemoveLoading, createMiganRuntime, type MiganRuntime } from "./ai";

const HealingContext = createContext<{
  algorithm: HealAlgorithm;
  setAlgorithm: (algorithm: HealAlgorithm) => void;
  feather: number;
  setFeather: (feather: number) => void;
  selectedPatch?: string;
  selectPatch: (id?: string) => void;
  hoveredPatch?: string;
  hoverPatch: (id?: string) => void;
  /** One prepared session serves every patch while the editor stays open. */
  migan: MiganRuntime;
} | null>(null);

/** Owns the tool's next-stroke settings, patch selection, and the AI runtime for the editor's lifetime. */
export function HealingProvider({
  children,
  onEdit,
}: {
  children: ReactNode;
  onEdit?: () => void;
}) {
  const gpu = useGpu();
  const migan = useMemo(() => createMiganRuntime(gpu), [gpu]);
  useEffect(() => () => migan.dispose(), [migan]);
  const [algorithm, setAlgorithm] = useState<HealAlgorithm>("clone");
  const [feather, setFeather] = useState(0.1);
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
        algorithm,
        setAlgorithm,
        feather,
        setFeather,
        selectedPatch,
        selectPatch,
        hoveredPatch,
        hoverPatch: setHoveredPatch,
        migan,
      }}
    >
      {children}
      {algorithm === "ai" && (
        <AiRemoveLoading migan={migan} onCancel={() => setAlgorithm("clone")} />
      )}
    </HealingContext>
  );
}

export function useHealing() {
  const context = useContext(HealingContext);
  if (!context) throw Error("A healing provider is required.");
  return context;
}
