export type Loading =
  | { kind: "idle" | "ready" }
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string };

/** Blocks the editor while the AI runtime and model load, with Cancel while the download can still be stopped. */
export function HealLoadingDialog({
  loading,
  onCancel,
  onRetry,
}: {
  loading: Exclude<Loading, { kind: "ready" }>;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
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
          {"message" in loading ? loading.message : "Starting the local AI…"}
        </p>
        <p className="mt-2 text-neutral-500">
          AI Remove loads a 28 MB model included with OpenLight. Processing
          stays on this device, and later uses in this session reuse it.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-neutral-300 hover:bg-white/10"
            onClick={onCancel}
          >
            Cancel
          </button>
          {loading.kind === "error" && (
            <button
              type="button"
              className="rounded bg-neutral-100 px-3 py-1.5 text-neutral-900"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
