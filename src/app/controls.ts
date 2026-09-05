import type { Gpu } from "vgpu";
import {
	moveLayer,
	removeLayer,
	setAdjustments,
	setLayer,
	setToneCurve,
} from "@/app/document/edits";
import {
	type ExportOptions,
	exportImage,
} from "@/app/editor/export/export-image";
import { createCameraRawXmpLoader } from "@/app/loaders/camera-raw-xmp";
import { addImageLayer, createImageLoader } from "@/app/loaders/image";
import { createLoaderRegistry } from "@/app/loaders/registry";
import {
	type Adjustments,
	defaultAdjustments,
	type ImageLayer,
} from "@/app/scene";
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
		addImageLayer: (file: File) =>
			addImageLayer(gpu, workspace.getDocument(), file),
		selectLayer: (id: string) => workspace.getDocument().selectLayer(id),
		setLayer: (
			id: string,
			change: Partial<Pick<ImageLayer, "name" | "visible" | "opacity">>,
		) => setLayer(workspace.getDocument(), id, change),
		removeLayer: (id: string) => removeLayer(workspace.getDocument(), id),
		moveLayer: (id: string, index: number) =>
			moveLayer(workspace.getDocument(), id, index),
		setAdjustments: (change: Partial<Adjustments>, layerId?: string) =>
			setAdjustments(workspace.getDocument(), change, layerId),
		setToneCurve: (curve?: ToneCurve, layerId?: string) =>
			setToneCurve(workspace.getDocument(), curve, layerId),
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
			const selectedLayerId = document?.selection.getState().layerId;
			const layer = scene?.layers.find((layer) => layer.id === selectedLayerId);
			return {
				selectedLayerId,
				layers: structuredClone(scene?.layers ?? []),
				file,
				documentId: document?.id,
				size: scene && [...scene.size],
				adjustments: { ...(layer?.adjustments ?? defaultAdjustments) },
				toneCurve: (layer?.toneCurve ?? defaultCurve).map((point) => ({
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
