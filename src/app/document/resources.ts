import type { Target } from "vgpu";

/** Owns the document's image files and GPU targets, outside scene history. */
export function createResources() {
	const images = new Map<string, { file: File; image: Target }>();
	let disposed = false;
	return {
		add(file: File, image: Target) {
			if (disposed) {
				throw new Error("Document is closed.");
			}
			const id = crypto.randomUUID();
			images.set(id, { file, image });
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
			for (const [id, { image }] of images) {
				if (!ids.has(id)) {
					image.color.dispose();
					images.delete(id);
				}
			}
		},
		dispose() {
			disposed = true;
			for (const { image } of images.values()) {
				image.color.dispose();
			}
			images.clear();
		},
	};
}
