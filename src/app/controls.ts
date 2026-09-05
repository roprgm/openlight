import type { Gpu } from "vgpu";
import { setAdjustments, setToneCurve } from "@/app/document/edits";
import {
	type ExportOptions,
	exportImage,
} from "@/app/editor/export/export-image";
import { createCameraRawXmpLoader } from "@/app/loaders/camera-raw-xmp";
import { createImageLoader } from "@/app/loaders/image";
import { createLoaderRegistry } from "@/app/loaders/registry";
import { type Adjustments, defaultAdjustments } from "@/app/scene";
import type { Workspace } from "@/app/workspace";
import { defaultCurve, type ToneCurve } from "@/features/tone-curves/curve";

/** Imperative commands bound to an explicit workspace, usable without React. */
export function createControls(gpu: Gpu, workspace: Workspace) {
	const image = createImageLoader(gpu, workspace);
	const xmp = createCameraRawXmpLoader(workspace);
	const files = createLoaderRegistry(
		[xmp, image],
		() => workspace.state.getState().status === "ready",
	);
	return {
		openFiles: files.openFiles,
		openFile: (file: File) => files.openFiles([file]),
		loadImage: (file: File) => files.loadFile(image, file),
		importXmp: (file: File) => files.loadFile(xmp, file),
		setAdjustments: (change: Partial<Adjustments>) =>
			setAdjustments(workspace.getDocument(), change),
		setToneCurve: (curve?: ToneCurve) =>
			setToneCurve(workspace.getDocument(), curve),
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
			return {
				file,
				documentId: document?.id,
				size: scene && [...scene.size],
				adjustments: { ...(scene?.adjustments ?? defaultAdjustments) },
				toneCurve: (scene?.toneCurve ?? defaultCurve).map((point) => ({
					...point,
				})),
				history: {
					...(document?.history.status.getState() ?? {
						undoCount: 0,
						redoCount: 0,
					}),
				},
			};
		},
	};
}

declare global {
	interface Window {
		openlight: ReturnType<typeof createControls>;
	}
}
