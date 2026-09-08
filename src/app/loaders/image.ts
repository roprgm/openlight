import type { Gpu } from "vgpu";
import type { Workspace } from "@/app/workspace";
import { canDecode, createDecoder } from "@/lib/decode";
import { createDocument } from "@/lib/editor/document";
import { createResources } from "@/lib/editor/document/resources";
import { defaultAdjustments } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { defaultCurve } from "@/lib/tone-curves/curve";
import type { FileLoader } from "./registry";

export function createImageLoader(gpu: Gpu, workspace: Workspace): FileLoader {
	const decode = createDecoder(gpu);
	return {
		kind: "document",
		accepts: canDecode,
		async load(file) {
			if (!(file instanceof File)) {
				throw new Error("loadImage requires a File.");
			}
			await workspace.open(file.name, async () => {
				const { image } = await decode(file);
				const resources = createResources();
				const source = resources.add(file, image);
				return createDocument(
					{
						frame: imageFrame(image.size),
						source,
						adjustments: { ...defaultAdjustments },
						toneCurve: defaultCurve,
					},
					resources,
				);
			});
		},
	};
}
