import { type Ref, useEffect, useImperativeHandle, useMemo } from "react";
import { useStore } from "zustand";
import { fitScale, usePanZoom } from "@/hooks/use-pan-zoom";
import { cropSize, type Geometry, orientedSize } from "./geometry";
import type { CropTool } from "./tool";

/** Keep one camera in crop-frame coordinates; editing only reveals the surrounding source. */
export type CropViewHandle = { resetView: () => void; fitView: () => void };
export function useCropView(
	tool: CropTool,
	applied: Geometry,
	ref: Ref<CropViewHandle>,
) {
	const size = tool.size;
	const draft = useStore(tool.state)?.geometry;
	const geometry = draft ?? applied;
	const reference = useMemo(
		() =>
			orientedSize(
				cropSize(size, applied),
				geometry.rotation - applied.rotation,
			),
		[size, applied, geometry.rotation],
	);
	const camera = usePanZoom(reference, { constrain: !draft });
	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			if (
				event.isComposing ||
				event.repeat ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			) {
				return;
			}
			if (draft && (event.key === "Enter" || event.key === "Escape")) {
				event.preventDefault();
				if (event.key === "Escape") {
					tool.cancel();
				} else {
					tool.apply();
					camera.resetView();
				}
			} else if (!draft && event.key.toLowerCase() === "c") {
				const target = event.target;
				if (
					target instanceof HTMLElement &&
					(target.isContentEditable ||
						target.closest('input, textarea, select, dialog, [role="dialog"]'))
				) {
					return;
				}
				event.preventDefault();
				tool.begin();
			}
		}
		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	}, [draft, tool, camera.resetView]);
	const output = cropSize(size, geometry);
	const scale = fitScale(reference, camera.viewport) * camera.view.zoom;
	useImperativeHandle(ref, () => ({
		fitView: camera.resetView,
		resetView: () =>
			camera.resetView({
				zoom:
					fitScale(size, camera.viewport) /
					fitScale(
						orientedSize(cropSize(size, applied), -applied.rotation),
						camera.viewport,
					),
				pan: [0, 0],
			}),
	}));
	return {
		...camera,
		view: {
			...camera.view,
			zoom: scale / (fitScale(output, camera.viewport) || 1),
		},
		frame: {
			width: output[0] * scale,
			height: output[1] * scale,
			marginLeft: camera.view.pan[0],
			marginTop: camera.view.pan[1],
		},
	};
}
