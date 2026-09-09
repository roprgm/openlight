import type { Target } from "vgpu";
import type { ImageSource, WhiteBalanceSource } from "@/lib/image-source";

/** Owns the document's image files and GPU targets, outside scene history. */
export function createResources() {
	const images = new Map<string, { file: File } & ImageSource>();
	let disposed = false;
	return {
		add(file: File, image: Target, whiteBalance?: WhiteBalanceSource) {
			if (disposed) {
				throw new Error("Document is closed.");
			}
			const id = crypto.randomUUID();
			images.set(id, { file, image, whiteBalance });
			return id;
		},
		get(id: string) {
			const resource = images.get(id);
			if (!resource) {
				throw new Error("Image resource is unavailable.");
			}
			return resource;
		},
		retain(ids: ReadonlySet<string>) {
			for (const [id, { image, whiteBalance }] of images) {
				if (!ids.has(id)) {
					image.color.dispose();
					whiteBalance?.dispose();
					images.delete(id);
				}
			}
		},
		dispose() {
			disposed = true;
			for (const { image, whiteBalance } of images.values()) {
				image.color.dispose();
				whiteBalance?.dispose();
			}
			images.clear();
		},
	};
}
