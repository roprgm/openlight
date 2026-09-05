import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { createControls } from "@/app/controls";
import { createWorkspace } from "./index";

/** Connects an imperative workspace and its browser commands to the app lifetime. */
export function useWorkspace() {
	const gpu = useGpu();
	const session = useMemo(() => {
		const workspace = createWorkspace();
		return { workspace, controls: createControls(gpu, workspace) };
	}, [gpu]);
	useEffect(() => {
		window.openlight = session.controls;
		return () => {
			Reflect.deleteProperty(window, "openlight");
			session.workspace.dispose();
		};
	}, [session]);
	return session;
}
