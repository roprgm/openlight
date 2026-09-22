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
import { HealLoadingDialog, type Loading } from "./loading-dialog";
import { createMiganRuntime, type MiganRuntime } from "./migan";

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
  const [loading, setLoading] = useState<Loading>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (algorithm !== "ai" || migan.ready) return;
    const controller = new AbortController();
    setLoading({ kind: "loading", message: "Loading the local AI runtime…" });
    void migan
      .prepare(controller.signal, (message) =>
        setLoading({ kind: "loading", message }),
      )
      .then(() => setLoading({ kind: "ready" }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoading({ kind: "error", message: String(error) });
        }
      });
    return () => controller.abort();
  }, [algorithm, attempt, migan]);
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
      {algorithm === "ai" && !migan.ready && loading.kind !== "ready" && (
        <HealLoadingDialog
          loading={loading}
          onCancel={() => {
            setAlgorithm("clone");
            setLoading({ kind: "idle" });
          }}
          onRetry={() => {
            setLoading({ kind: "idle" });
            setAttempt((value) => value + 1);
          }}
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
