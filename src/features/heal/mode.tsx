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
import type * as AiRemove from "./ai";

/** The AI Remove capability the app composes in when its flag is on; Smart clone alone otherwise. */
export type AiRemoveModule = typeof AiRemove;

type Ai = {
  migan: AiRemove.MiganRuntime;
  createGeneration: AiRemoveModule["createAiGeneration"];
};

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
  ai?: Ai;
} | null>(null);

/** Owns the tool's next-stroke settings, patch selection, and the AI runtime for the editor's lifetime. */
export function HealingProvider({
  children,
  onEdit,
  ai,
}: {
  children: ReactNode;
  onEdit?: () => void;
  ai?: AiRemoveModule;
}) {
  const gpu = useGpu();
  const migan = useMemo(() => ai?.createMiganRuntime(gpu), [ai, gpu]);
  useEffect(() => () => migan?.dispose(), [migan]);
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
        ai:
          ai && migan
            ? { migan, createGeneration: ai.createAiGeneration }
            : undefined,
      }}
    >
      {children}
      {ai && migan && algorithm === "ai" && (
        <ai.AiRemoveLoading
          migan={migan}
          onCancel={() => setAlgorithm("clone")}
        />
      )}
    </HealingContext>
  );
}

export function useHealing() {
  const context = useContext(HealingContext);
  if (!context) throw Error("A healing provider is required.");
  return context;
}
