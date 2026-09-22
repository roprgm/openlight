import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { createControls } from "@/app/controls";
import { createAutosave } from "@/app/draft/autosave";
import { createDraftSession } from "@/app/draft/session";
import { createDraftStore } from "@/app/draft/store";
import { createWorkspace } from ".";

/**
 * Connects an imperative workspace, its browser commands, and draft autosave to the app lifetime.
 * A startup URL opens while the session is created, so the first paint is already loading; otherwise a stored draft is offered.
 */
export function useWorkspace(startup?: string) {
  const gpu = useGpu();
  const session = useMemo(() => {
    const workspace = createWorkspace();
    const store = createDraftStore();
    const controls = createControls(gpu, workspace, store);
    const drafts = createDraftSession(store, controls);
    if (startup) {
      void controls.loadUrl(startup);
    } else {
      drafts.offer();
    }
    return { workspace, store, controls, drafts };
  }, [gpu, startup]);
  useEffect(() => {
    const { workspace, store, controls, drafts } = session;
    const autosave = createAutosave(workspace, store, drafts.report);
    window.openlight = controls;
    return () => {
      Reflect.deleteProperty(window, "openlight");
      autosave.dispose();
      workspace.dispose();
    };
  }, [session]);
  return session;
}
