import { createStore } from "zustand/vanilla";
import type { DraftStore } from "./store";

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What the start screen offers from draft storage: the stored draft's name, and a failure to mention without blocking.
 * Autosave fails the same way on every save, so a dismissed message stays dismissed.
 */
export function createDraftSession(
  store: DraftStore,
  commands: { recoverDraft(): Promise<void>; discardDraft(): Promise<void> },
) {
  const state = createStore<{ available?: string; error?: string }>(() => ({}));
  let dismissed: string | undefined;
  function report(error: unknown) {
    if (message(error) !== dismissed) {
      state.setState({ error: message(error) });
    }
  }
  return {
    state,
    report,
    /** Looks for a draft from an earlier visit. */
    offer() {
      store
        .peek()
        .then((found) => state.setState({ available: found?.name }))
        .catch(report);
    },
    recover() {
      state.setState({ available: undefined });
      commands.recoverDraft().catch(report);
    },
    forget() {
      commands
        .discardDraft()
        .then(() => state.setState({ available: undefined }), report);
    },
    dismiss() {
      dismissed = state.getState().error;
      state.setState({ error: undefined });
    },
  };
}

export type DraftSession = ReturnType<typeof createDraftSession>;
