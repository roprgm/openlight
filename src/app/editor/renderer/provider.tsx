import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { useGpu } from "vgpu-react";
import { useDocument } from "@/app/document/provider";
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

type RendererProviderProps = { children: ReactNode };

export function RendererProvider({ children }: RendererProviderProps) {
	const gpu = useGpu();
	const document = useDocument();
	const renderer = useMemo(
		() => createRenderer(gpu, document),
		[gpu, document],
	);
	useEffect(() => {
		const render = () => renderer.update(document.scene.getState());
		const unsubscribe = document.scene.subscribe(render);
		const unselect = document.selection.subscribe(render);
		render();
		return () => {
			unsubscribe();
			unselect();
			renderer.dispose();
		};
	}, [renderer, document]);
	return <RendererContext value={renderer}>{children}</RendererContext>;
}
