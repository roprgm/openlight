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
import { fullRect } from "@/features/crop/geometry";
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
		const render = () => {
			const scene = document.scene.getState();
			const crop = document.preview.getState().crop;
			renderer.update(
				crop
					? { ...scene, geometry: { ...crop.geometry, ...fullRect } }
					: scene,
			);
		};
		const unsubscribe = document.scene.subscribe(render);
		const unsubscribePreview = document.preview.subscribe((next, previous) => {
			if (
				next.crop?.geometry.angle !== previous.crop?.geometry.angle ||
				next.crop?.geometry.rotation !== previous.crop?.geometry.rotation
			) {
				render();
			}
		});
		render();
		return () => {
			unsubscribe();
			unsubscribePreview();
			renderer.dispose();
		};
	}, [renderer, document]);
	return <RendererContext value={renderer}>{children}</RendererContext>;
}
