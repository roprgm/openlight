import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useGpu } from "vgpu-react";
import { useDocument, useScene } from "@/components/editor/session";
import type { createRenderer } from "@/lib/editor/renderer";

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
	createRenderer: typeof createRenderer;
};

export function RendererProvider({
	children,
	createRenderer,
}: RendererProviderProps) {
	const gpu = useGpu();
	const document = useDocument();
	const sourceId = useScene((scene) => scene.source);
	const source = document.resources.get(sourceId);
	const renderer = useMemo(
		() => createRenderer(gpu, source),
		[gpu, source, createRenderer],
	);
	const [error, setError] = useState<string>();
	const [processing, setProcessing] = useState(false);

	useEffect(() => {
		let active = true;
		const render = () => {
			const scene = document.scene.getState();
			setError(undefined);
			setProcessing(true);
			renderer
				.update(scene)
				.catch((error) => {
					if (active) {
						setError(String(error));
					}
				})
				.finally(() => {
					if (active && document.scene.getState() === scene) {
						setProcessing(false);
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
			{processing && (
				<p
					role="status"
					className="fixed bottom-4 left-4 rounded bg-neutral-900 px-3 py-2 text-neutral-300 text-sm"
				>
					Processing image…
				</p>
			)}
			{error && <RendererError message={error} />}
		</RendererContext>
	);
}
