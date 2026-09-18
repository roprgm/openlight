import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { Gpu } from "vgpu";
import { useGpu } from "vgpu-react";
import type { ImageSource } from "@/core/image";
import type { createRenderer } from "@/core/renderer";
import { useDocument, useScene } from "./session";

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

function RendererError({ message }: { message: string }) {
	return (
		<p
			role="alert"
			className="fixed bottom-4 left-4 rounded bg-neutral-900 px-3 py-2 text-red-300 text-sm"
		>
			Renderer error: {message}
		</p>
	);
}

type RendererProviderProps = {
	children: ReactNode;
	createRenderer: (
		gpu: Gpu,
		source: ImageSource,
	) => ReturnType<typeof createRenderer>;
};

export function RendererProvider({
	children,
	createRenderer,
}: RendererProviderProps) {
	const gpu = useGpu();
	const document = useDocument();
	const sourceId = useScene((scene) => scene.layers[0].source);
	const source = document.resources.get(sourceId);
	const renderer = useMemo(
		() => createRenderer(gpu, source),
		[gpu, source, createRenderer],
	);
	const [error, setError] = useState<string>();

	useEffect(() => {
		let active = true;
		const render = () => {
			setError(undefined);
			renderer.update(document.scene.getState()).catch((error) => {
				if (active) {
					setError(String(error));
				}
			});
		};
		const unsubscribe = document.scene.subscribe(render);
		render();
		return () => {
			active = false;
			unsubscribe();
			renderer.dispose();
		};
	}, [renderer, document]);

	return (
		<RendererContext value={renderer}>
			{children}
			{error && <RendererError message={error} />}
		</RendererContext>
	);
}
