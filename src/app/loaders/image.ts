import type { Gpu } from "vgpu";
import type { EditorDocument } from "@/app/document";
import { createDocument } from "@/app/document";
import { createImageLayer } from "@/app/document/edits";
import { createResources } from "@/app/document/resources";
import type { Workspace } from "@/app/workspace";
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
						layers: [createImageLayer(source, file.name)],
					},
					resources,
				);
			});
		},
	};
}

/** Decode before editing so failed imports leave the document intact. */
export async function addImageLayer(
	gpu: Gpu,
	document: EditorDocument,
	file: File,
) {
	if (!(file instanceof File)) {
		throw new Error("addImageLayer requires a File.");
	}
	const image = await decode(gpu, file);
	let added = false;
	try {
		document.history.commit();
		const source = document.resources.add(file, image);
		added = true;
		const layer = createImageLayer(source, file.name);
		const scene = document.scene.getState();
		document.edit({ ...scene, layers: [...scene.layers, layer] });
		document.selectLayer(layer.id);
		return layer.id;
	} finally {
		if (!added) {
			image.color.dispose();
		}
	}
}
