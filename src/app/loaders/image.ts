import type { Gpu } from "vgpu";
import { createDocument } from "@/app/document";
import { createResources } from "@/app/document/resources";
import { defaultAdjustments } from "@/app/scene";
import type { Workspace } from "@/app/workspace";
import { defaultCurve } from "@/features/tone-curves/curve";
import decode, { canDecode } from "@/lib/decode";
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
				const image = await decode(gpu, file);
				const resources = createResources();
				const source = resources.add(file, image);
				return createDocument(
					{
						size: [image.size[0], image.size[1]],
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
