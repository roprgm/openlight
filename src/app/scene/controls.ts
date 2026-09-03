import { useEffect, useMemo } from "react";
import { useGpu } from "vgpu-react";
import { useScene } from ".";

function getState() {
	const scene = useScene.getState();
	return {
		file: scene.source?.file.name,
		adjustments: { ...scene.adjustments },
		curve: scene.curve.map((point) => ({ ...point })),
	};
}

declare global {
	interface Window {
		openlight: ReturnType<typeof useControls>;
	}
}

export function useControls() {
	const gpu = useGpu();
	const controls = useMemo(
		() => ({
			loadImage: (file: File) => useScene.getState().loadImage(gpu, file),
			setAdjustments: useScene.getState().setAdjustments,
			setCurve: useScene.getState().setCurve,
			getState,
		}),
		[gpu],
	);
	useEffect(() => {
		window.openlight = controls;
		return () => {
			Reflect.deleteProperty(window, "openlight");
		};
	}, [controls]);
	return controls;
}
