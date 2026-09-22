import { useEffect, useState } from "react";
import { HealLoadingDialog, type Loading } from "./loading-dialog";
import type { MiganRuntime } from "./migan";

export { createAiGeneration } from "./generation";
export { createMiganRuntime, type MiganRuntime } from "./migan";

/** Prepares the runtime while AI Remove is selected, blocking the editor until it is ready or cancelled. */
export function AiRemoveLoading({
  migan,
  onCancel,
}: {
  migan: MiganRuntime;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState<Loading>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (migan.ready) return;
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
  }, [attempt, migan]);
  if (migan.ready || loading.kind === "ready") return null;
  return (
    <HealLoadingDialog
      loading={loading}
      onCancel={onCancel}
      onRetry={() => {
        setLoading({ kind: "idle" });
        setAttempt((value) => value + 1);
      }}
    />
  );
}
