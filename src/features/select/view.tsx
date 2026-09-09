import { useEffect } from "react";
import { useGpu } from "vgpu-react";
import { RendererProvider, useRenderer } from "@/components/editor/pipeline";
import {
	EditorPanel,
	useDocument,
	useScene,
} from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { SelectionImage } from "./image";
import { SelectionOptions } from "./options";
import { SelectionPointer } from "./pointer";
import { getSelection } from "./session";

function SelectionView() {
	const selection = getSelection(useGpu(), useDocument());
	const renderer = useRenderer();
	const size = useScene((scene) => scene.frame.size);
	useEffect(
		() =>
			renderer.subscribe(() => {
				void selection.prepare(renderer.outputImage());
			}),
		[renderer, selection],
	);
	async function apply() {
		const status = selection.state.getState().status;
		if (status === "growing" || status === "preparing") return;
		if (status === "preview" && !(await selection.commit())) return;
		selection.close();
	}
	useShortcuts(
		{
			escape: selection.escape,
			enter: () => {
				void apply();
			},
		},
		{ inputs: true },
	);
	return (
		<>
			<EditorViewport size={size}>
				<SelectionImage />
				<SelectionPointer
					selection={selection}
					size={[Math.round(size[0]), Math.round(size[1])]}
				/>
			</EditorViewport>
			<EditorPanel>
				<SelectionOptions
					selection={selection}
					onApply={() => {
						void apply();
					}}
				/>
			</EditorPanel>
		</>
	);
}

export function SelectEditor() {
	return (
		<RendererProvider>
			<SelectionView />
		</RendererProvider>
	);
}
