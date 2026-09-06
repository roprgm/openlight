import { useMemo, useState } from "react";
import { useStore } from "zustand";
import {
	DocumentProvider,
	useDocument,
	useScene,
} from "@/app/document/provider";
import type { Workspace } from "@/app/workspace";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import { CropButton } from "@/features/crop/button";
import type { CropTool } from "@/features/crop/tool";
import { CropView } from "@/features/crop/view";
import { createCamera } from "@/hooks/use-pan-zoom";
import { EditorCanvas } from "./canvas";
import { RendererProvider, useRenderer } from "./renderer/provider";
import { Sidebar } from "./sidebar";

function DocumentEditor({ tool }: { tool: CropTool }) {
	const [width, onWidthChange] = useState(288);
	const panel = { width, onWidthChange };
	const size = useScene((scene) => scene.size);
	const geometry = useScene((scene) => scene.geometry);
	const camera = useMemo(createCamera, [size[0], size[1]]);
	const crop = useStore(tool.state);
	const clipping = useStore(useDocument().preview);
	const renderer = useRenderer();
	if (crop) {
		return (
			<CropView
				tool={tool}
				crop={crop}
				applied={geometry}
				state={camera}
				image={renderer.fullImage}
				subscribe={renderer.subscribe}
				clipping={clipping}
				panel={panel}
			/>
		);
	}
	return (
		<>
			<EditorCanvas state={camera} />
			<Sidebar {...panel}>
				<CropButton onClick={tool.begin} />
			</Sidebar>
		</>
	);
}

type EditorProps = {
	state: ReturnType<Workspace["state"]["getState"]>;
	crop: CropTool;
};

function LoadingStatus({ state }: Pick<EditorProps, "state">) {
	if (state.status !== "error") {
		return <Spinner />;
	}
	return (
		<p className="max-w-md text-center text-neutral-400">
			Couldn't open {state.file}: {state.error}
		</p>
	);
}

function EditorContent({ state, crop }: EditorProps) {
	if (state.status === "ready") {
		const { document } = state;
		const image = document.resources.get(
			document.scene.getState().source,
		).image;
		return (
			<DocumentProvider key={document.id} value={document}>
				<RendererProvider source={image}>
					<DocumentEditor tool={crop} />
				</RendererProvider>
			</DocumentProvider>
		);
	}
	return (
		<>
			<div className="grid flex-1 place-items-center">
				<LoadingStatus state={state} />
			</div>
			<ResizablePanel />
		</>
	);
}

export default function Editor({ state, crop }: EditorProps) {
	return (
		<main className="flex h-dvh flex-col md:flex-row">
			<EditorContent state={state} crop={crop} />
		</main>
	);
}
