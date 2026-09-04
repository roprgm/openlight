import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import {
	type ExportOptions,
	exportImage,
} from "@/app/editor/export/export-image";
import { cameraRawXmpLoader } from "@/app/loaders/camera-raw-xmp";
import { createImageLoader } from "@/app/loaders/image";
import { createLoaderRegistry } from "@/app/loaders/registry";
import { useScene } from "@/app/scene";

function getState() {
	const scene = useScene.getState();
	return {
		file: scene.source?.file.name,
		adjustments: { ...scene.adjustments },
		toneCurve: scene.toneCurve.map((point) => ({ ...point })),
	};
}

declare global {
	interface Window {
		openlight: ReturnType<typeof useControls>;
	}
}

export function useControls() {
	const gpu = useGpu();
	const controls = useMemo(() => {
		const image = createImageLoader(gpu);
		const files = createLoaderRegistry([cameraRawXmpLoader, image]);
		return {
			openFiles: files.openFiles,
			openFile: (file: File) => files.openFiles([file]),
			loadImage: (file: File) => files.loadFile(image, file),
			importXmp: (file: File) => files.loadFile(cameraRawXmpLoader, file),
			setAdjustments: useScene.getState().setAdjustments,
			setToneCurve: useScene.getState().setToneCurve,
			exportImage: (options?: ExportOptions) => exportImage(gpu, options),
			getState,
		};
	}, [gpu]);
	useEffect(() => {
		window.openlight = controls;
		return () => {
			Reflect.deleteProperty(window, "openlight");
		};
	}, [controls]);
	return controls;
}
