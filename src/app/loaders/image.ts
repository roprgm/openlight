import type { Gpu } from "vgpu";
import { defaultAdjustments, useScene } from "@/app/scene";
import { defaultCurve } from "@/features/tone-curves/curve";
import decode, { canDecode } from "@/lib/decode";
import type { FileLoader } from "./registry";

export function createImageLoader(gpu: Gpu): FileLoader {
	return {
		kind: "document",
		accepts: canDecode,
		load: async (file) => {
			if (!(file instanceof File)) {
				throw new Error("loadImage requires a File.");
			}
			const source = { file };
			useScene.getState().source?.image?.color.dispose();
			useScene.setState({
				source,
				adjustments: { ...defaultAdjustments },
				toneCurve: defaultCurve,
			});
			try {
				const image = await decode(gpu, file);
				if (useScene.getState().source !== source) {
					image.color.dispose();
					return;
				}
				useScene.setState({ source: { file, image } });
			} catch (error) {
				if (useScene.getState().source === source) {
					useScene.setState({ source: { file, error: String(error) } });
				}
			}
		},
	};
}
