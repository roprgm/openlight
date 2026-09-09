import type { Gpu } from "vgpu";
import {
	type ExportOptions,
	exportImage,
} from "@/app/editor/export/export-image";
import { createCameraRawXmpLoader } from "@/app/loaders/camera-raw-xmp";
import { createImageLoader } from "@/app/loaders/image";
import { createLoaderRegistry } from "@/app/loaders/registry";
import type { Workspace } from "@/app/workspace";
import type { Operation, SelectionOptions } from "@/features/select/cost";
import { getSelection } from "@/features/select/session";
import type { Preview } from "@/lib/editor/document";
import { setAdjustments, setToneCurve } from "@/lib/editor/document/edits";
import {
	type Adjustments,
	defaultAdjustments,
	type Scene,
} from "@/lib/editor/scene";
import { defaultCurve, type ToneCurve } from "@/lib/tone-curves/curve";

/** Imperative commands bound to an explicit workspace, usable without React. */
export function createControls(gpu: Gpu, workspace: Workspace) {
	const image = createImageLoader(gpu, workspace);
	const xmp = createCameraRawXmpLoader(workspace);
	const files = createLoaderRegistry(
		[xmp, image],
		() => workspace.state.getState().status === "ready",
	);

	return {
		enterWand: () => getSelection(gpu, workspace.getDocument()).enter(),
		selectAt: (point: readonly [number, number], operation?: Operation) =>
			getSelection(gpu, workspace.getDocument()).selectAt(point, operation),
		setSelectionOptions: (options: Partial<SelectionOptions>) =>
			getSelection(gpu, workspace.getDocument()).configure(options),
		clearSelection: () => getSelection(gpu, workspace.getDocument()).clear(),
		getSelection() {
			const { open, status, count, bounds } = getSelection(
				gpu,
				workspace.getDocument(),
			).state.getState();
			return {
				open,
				status,
				active: count > 0,
				count,
				bounds: bounds?.slice() ?? null,
			};
		},
		openFiles: files.openFiles,
		openFile: (file: File) => files.openFiles([file]),
		loadImage: (file: File) => files.loadFile(image, file),
		importXmp: (file: File) => files.loadFile(xmp, file),
		setAdjustments: (change: Partial<Adjustments>) =>
			setAdjustments(workspace.getDocument(), change),
		setToneCurve: (curve?: ToneCurve) =>
			setToneCurve(workspace.getDocument(), curve),
		editScene(change: Partial<Scene>) {
			const document = workspace.getDocument();
			document.edit({ ...document.scene.getState(), ...change });
		},
		setPreview: (change: Partial<Preview>) =>
			workspace.getDocument().preview.setState(change),
		beginEdit: () => workspace.getDocument().history.begin(),
		commitEdit: () => workspace.getDocument().history.commit(),
		cancelEdit: () => workspace.getDocument().history.cancel(),
		undo: () => workspace.getDocument().history.undo(),
		redo: () => workspace.getDocument().history.redo(),
		exportImage: (options?: ExportOptions) =>
			exportImage(gpu, workspace.getDocument(), options),
		getState() {
			const { file, document } = workspace.state.getState();
			const scene = document?.scene.getState();
			return structuredClone({
				file,
				preview: document?.preview.getState(),
				documentId: document?.id,
				size: scene?.frame.size,
				frame: scene?.frame,
				adjustments: scene?.adjustments ?? defaultAdjustments,
				toneCurve: scene?.toneCurve ?? defaultCurve,
				history: document?.history.status.getState() ?? {
					undoCount: 0,
					redoCount: 0,
				},
			});
		},
	};
}

declare global {
	interface Window {
		openlight: ReturnType<typeof createControls>;
	}
}
