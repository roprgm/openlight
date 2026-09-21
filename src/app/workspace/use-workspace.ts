import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { createControls } from "@/app/controls";
import { createWorkspace } from ".";

/**
 * Connects an imperative workspace and its browser commands to the app lifetime.
 * A startup URL opens while the session is created, so the first paint is already loading.
 */
export function useWorkspace(startup?: string) {
  const gpu = useGpu();
  const session = useMemo(() => {
    const workspace = createWorkspace();
    const controls = createControls(gpu, workspace);
    if (startup) {
      void controls.loadUrl(startup);
    }
    return { workspace, controls };
  }, [gpu, startup]);
  useEffect(() => {
    window.openlight = session.controls;
    return () => {
      Reflect.deleteProperty(window, "openlight");
      session.workspace.dispose();
    };
  }, [session]);
  return session;
}
