import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import type { Target } from "vgpu";
import { useGpu } from "vgpu-react";
import { useDocument } from "@/app/document/provider";
import type { Scene } from "@/app/scene";
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
	const document = useDocument();
	const renderer = useMemo(() => createRenderer(gpu, source), [gpu, source]);
	useEffect(() => {
		const render = (scene: Scene) => {
			renderer.update(scene);
		};
		const unsubscribe = document.scene.subscribe(render);
		render(document.scene.getState());
		return () => {
			unsubscribe();
			renderer.dispose();
		};
	}, [renderer, document]);
	return <RendererContext value={renderer}>{children}</RendererContext>;
}
