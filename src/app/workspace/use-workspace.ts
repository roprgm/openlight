import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { createControls } from "@/app/controls";
import { createDrafts } from "@/app/drafts";
import { createWorkspace } from ".";

/**
 * Connects an imperative workspace and its browser commands to the app lifetime.
 * A startup URL opens while the session is created, so the first paint is already loading.
 */
export function useWorkspace(startup?: string) {
  const gpu = useGpu();
  const session = useMemo(() => {
    const workspace = createWorkspace();
    const drafts = createDrafts(gpu, workspace);
    const controls = {
      ...createControls(gpu, workspace),
      recoverDraft: drafts.recoverDraft,
      discardDraft: drafts.discardDraft,
    };
    if (startup) {
      void controls.loadUrl(startup);
    }
    return { workspace, controls, drafts };
  }, [gpu, startup]);
  useEffect(() => {
    window.openlight = session.controls;
    session.drafts.start();
    return () => {
      Reflect.deleteProperty(window, "openlight");
      session.drafts.dispose();
      session.workspace.dispose();
    };
  }, [session]);
  return session;
}

declare global {
  interface Window {
    openlight: ReturnType<typeof createControls> & {
      recoverDraft: () => Promise<void>;
      discardDraft: () => Promise<void>;
    };
  }
}
