import type { Gpu } from "vgpu";
import type { Workspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import decode, { canDecode } from "@/core/image/decode";
import { imageFrame } from "@/core/image/frame";
import { defaultAdjustments } from "@/features/adjustments/model";
import { defaultCurve } from "@/features/tone-curves/curve";
import type { FileLoader } from "./registry";

export function createImageLoader(gpu: Gpu, workspace: Workspace): FileLoader {
	return {
		kind: "document",
		accepts: canDecode,
		async load(file) {
			if (!(file instanceof File)) {
				throw new Error("loadImage requires a File.");
			}
			await workspace.open(file.name, async () => {
				const decoded = await decode(gpu, file);
				const resources = createResources();
				const source = resources.add(file, decoded);
				return createDocument(
					{
						frame: imageFrame(decoded.image.size),
						image: {
							id: crypto.randomUUID(),
							whiteBalance: decoded.raw?.asShot,
							source,
							adjustments: { ...defaultAdjustments },
							toneCurve: defaultCurve,
						},
						layers: [],
					},
					resources,
				);
			});
		},
	};
}
