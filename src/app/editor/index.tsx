import { Canvas } from "vgpu-react";
import type { Source } from "@/app/scene";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { usePanZoom } from "@/hooks/use-pan-zoom";
import type { Target } from "@/lib/decode";
import { CanvasRenderer } from "./renderer";
import { RendererProvider } from "./renderer/provider";
import { Sidebar } from "./sidebar";

type WorkspaceProps = { image: Target };

function ImageCanvas({ image }: WorkspaceProps) {
	const { ref, view, handlers } = usePanZoom(image.size);

	return (
		<div
			className="grid min-h-0 min-w-0 flex-1 cursor-grab touch-none place-items-center active:cursor-grabbing"
			ref={ref}
			{...handlers}
		>
			<Canvas className="size-full min-h-0">
				<CanvasRenderer view={view} />
			</Canvas>
		</div>
	);
}

function Workspace({ image }: WorkspaceProps) {
	return (
		<RendererProvider source={image}>
			<ImageCanvas image={image} />
			<Sidebar />
		</RendererProvider>
	);
}

type EditorProps = { source: Source };

export default function Editor({ source }: EditorProps) {
	const { image, error } = source;

	return (
		<main className="flex h-dvh flex-col md:flex-row">
			{image ? (
				<Workspace image={image} />
			) : (
				<>
					<div className="grid flex-1 place-items-center">
						{error ? (
							<p className="max-w-md text-center text-neutral-400">
								Couldn't open {source.file.name}: {error}
							</p>
						) : (
							<Spinner />
						)}
					</div>
					<ResizablePanel />
				</>
			)}
		</main>
	);
}
