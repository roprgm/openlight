import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useGpu } from "vgpu-react";
import type { HealAlgorithm } from "@/core/document";
import { isMiganReady, prepareMigan } from "./migan";

const HealingContext = createContext<{
  algorithm: HealAlgorithm;
  setAlgorithm: (algorithm: HealAlgorithm) => void;
  selectedPatch?: string;
  selectPatch: (id?: string) => void;
  hoveredPatch?: string;
  hoverPatch: (id?: string) => void;
} | null>(null);

type Loading =
  | { kind: "idle" | "ready" }
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string };

export function HealingProvider({
  children,
  onEdit,
}: {
  children: ReactNode;
  onEdit?: () => void;
}) {
  const gpu = useGpu();
  const [algorithm, setAlgorithm] = useState<HealAlgorithm>("healing");
  const [selectedPatch, setSelectedPatch] = useState<string>();
  const [hoveredPatch, setHoveredPatch] = useState<string>();
  const [loading, setLoading] = useState<Loading>(() => ({
    kind: isMiganReady() ? "ready" : "idle",
  }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (algorithm !== "ai" || isMiganReady()) return;
    const controller = new AbortController();
    setLoading({ kind: "loading", message: "Loading the local AI runtime…" });
    void prepareMigan(gpu, controller.signal, (message) =>
      setLoading({ kind: "loading", message }),
    )
      .then(() => setLoading({ kind: "ready" }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoading({ kind: "error", message: String(error) });
        }
      });
    return () => controller.abort();
  }, [algorithm, attempt, gpu]);
  function cancel() {
    setAlgorithm("healing");
    setLoading({ kind: "idle" });
  }
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
        selectedPatch,
        selectPatch,
        hoveredPatch,
        hoverPatch: setHoveredPatch,
      }}
    >
      {children}
      {algorithm === "ai" && loading.kind !== "ready" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Preparing AI Remove"
            className="w-full max-w-sm rounded-lg border border-white/10 bg-neutral-900 p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center gap-3">
              {loading.kind === "loading" && (
                <span className="size-5 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-100" />
              )}
              <h2 className="font-medium text-neutral-100">
                {loading.kind === "error"
                  ? "AI Remove couldn't load"
                  : "Preparing AI Remove"}
              </h2>
            </div>
            <p className="text-neutral-300">
              {"message" in loading
                ? loading.message
                : "Starting the local AI…"}
            </p>
            <p className="mt-2 text-neutral-500">
              AI Remove loads a 28 MB model included with OpenLight. Processing
              stays on this device, and later uses in this session reuse it.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded px-3 py-1.5 text-neutral-300 hover:bg-white/10"
                onClick={cancel}
              >
                Cancel
              </button>
              {loading.kind === "error" && (
                <button
                  type="button"
                  className="rounded bg-neutral-100 px-3 py-1.5 text-neutral-900"
                  onClick={() => {
                    setLoading({ kind: "idle" });
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </HealingContext>
  );
}

export function useHealing() {
  const context = useContext(HealingContext);
  if (!context) throw Error("A healing provider is required.");
  return context;
}
