import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { useGpu } from "vgpu-react";
import { useDocument, useScene } from "@/components/editor/session";
import { createRenderer } from "@/lib/editor/renderer";

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

type RendererProviderProps = { children: ReactNode };

export function RendererProvider({ children }: RendererProviderProps) {
	const gpu = useGpu();
	const document = useDocument();
	const sourceId = useScene((scene) => scene.source);
	const { image: source, development } = document.resources.get(sourceId);
	const renderer = useMemo(
		() => createRenderer(gpu, source, development),
		[gpu, source, development],
	);
	useEffect(() => {
		const render = () => renderer.update(document.scene.getState());
		const unsubscribe = document.scene.subscribe(render);
		render();
		return () => {
			unsubscribe();
			renderer.dispose();
		};
	}, [renderer, document]);
	return <RendererContext value={renderer}>{children}</RendererContext>;
}
