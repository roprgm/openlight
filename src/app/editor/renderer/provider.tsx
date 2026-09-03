import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import type { Target } from "vgpu";
import { useFrameLoop, useGpu } from "vgpu-react";
import { useScene } from "@/app/scene";
import { createRenderer } from "./renderer";

const RendererContext = createContext<ReturnType<typeof createRenderer> | null>(
	null,
);

export function useRenderer() {
	const renderer = useContext(RendererContext);
	if (!renderer) {
		throw new Error("useRenderer requires RendererProvider.");
	}
	return renderer;
}

type RendererProviderProps = { source: Target; children: ReactNode };

export function RendererProvider({ source, children }: RendererProviderProps) {
	const gpu = useGpu();
	const renderer = useMemo(() => createRenderer(gpu, source), [gpu, source]);
	useEffect(() => () => renderer.dispose(), [renderer]);
	useFrameLoop((frame) => {
		const scene = useScene.getState();
		if (scene.source?.image === source) {
			renderer.render(frame, scene);
		}
	});
	return <RendererContext value={renderer}>{children}</RendererContext>;
}
