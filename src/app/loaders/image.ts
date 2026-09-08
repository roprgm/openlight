import type { Gpu, Target } from "vgpu";
import type { Workspace } from "@/app/workspace";
import decode, { canDecode } from "@/lib/decode";
import { createDocument } from "@/lib/editor/document";
import {
	createResources,
	type Development,
} from "@/lib/editor/document/resources";
import { defaultAdjustments } from "@/lib/editor/scene";
import { imageFrame } from "@/lib/image-frame/geometry";
import { defaultCurve } from "@/lib/tone-curves/curve";
import type { FileLoader } from "./registry";

type ImageDecoder = {
	accepts(file: File): boolean;
	load(file: File): Promise<{ image: Target; development?: Development }>;
};

export function createImageLoader(
	gpu: Gpu,
	workspace: Workspace,
	additional: ImageDecoder[] = [],
): FileLoader {
	const decoders: ImageDecoder[] = [
		...additional,
		{
			accepts: canDecode,
			load: async (file) => ({ image: await decode(gpu, file) }),
		},
	];
	return {
		kind: "document",
		accepts: (file) => decoders.some((decoder) => decoder.accepts(file)),
		async load(file) {
			if (!(file instanceof File)) {
				throw new Error("loadImage requires a File.");
			}
			await workspace.open(file.name, async () => {
				const decoder = decoders.find((decoder) => decoder.accepts(file));
				if (!decoder) {
					throw Error(`Unsupported image: ${file.name}`);
				}
				const { image, development } = await decoder.load(file);
				const resources = createResources();
				const source = resources.add(file, image, development);
				return createDocument(
					{
						frame: imageFrame(image.size),
						source,
						sourceSettings: development?.defaults,
						adjustments: { ...defaultAdjustments },
						toneCurve: defaultCurve,
					},
					resources,
				);
			});
		},
	};
}
